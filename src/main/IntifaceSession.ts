import {once} from 'node:events';
import WebSocket from 'ws';
import typia from 'typia';
import TypedEventEmitter from '../common/TypedEventEmitter';
import {Result} from '../common/result';
import {
    IntifaceDeviceListPayload,
    IntifaceErrorPayload,
    IntifaceMessagePayload,
    IntifaceMessageWithType,
    IntifacePacket,
    IntifaceSendMessageWithType,
    IntifaceUInt32,
    Device,
} from './IntifaceProtocol';
import {SubLogger} from './services/LoggerService';

type PendingResponse = Result<IntifaceMessageWithType, unknown>;

type SessionEvents = {
    deviceList: (devices: Record<string, Device>) => void;
    close: () => void;
};

export default class IntifaceSession extends TypedEventEmitter<SessionEvents> {
    private ws?: WebSocket;
    private callbacks = new Map<number, (result: PendingResponse) => void>();
    private lastMessageId = 0;
    private connected = false;
    private disposed = false;
    private scanTimer?: ReturnType<typeof setInterval>;
    private scanInProgress = false;
    private initialDeviceList?: Record<string, Device>;
    private recentlySentCommands = 0;
    private readonly commandReportTimer: ReturnType<typeof setInterval>;

    constructor(
        private readonly uri: string,
        private readonly logger: SubLogger,
    ) {
        super();
        this.commandReportTimer = setInterval(() => {
            if (this.recentlySentCommands === 0) return;
            this.logger.log(`Sent ${this.recentlySentCommands} high-frequency commands in the last 15 seconds`);
            this.recentlySentCommands = 0;
        }, 15_000);
    }

    async connect(signal: AbortSignal) {
        this.ws = new WebSocket(this.uri);
        this.attachSocketHandlers();

        const attemptSignal = AbortSignal.any([signal, AbortSignal.timeout(3000)]);
        await this.waitForOpen(attemptSignal);
        await this.request({
            type: 'RequestServerInfo',
            ClientName: 'OscGoesBrrr',
            ProtocolVersionMajor: 4,
            ProtocolVersionMinor: 0,
        }, attemptSignal);
        await this.request({type: 'RequestDeviceList'}, attemptSignal);
        attemptSignal.throwIfAborted();

        this.connected = true;
        if (this.initialDeviceList) this.emit('deviceList', this.initialDeviceList);
        this.startScanTimer();
    }

    dispose(terminate = true) {
        if (this.disposed) return;
        this.disposed = true;
        this.connected = false;
        clearInterval(this.scanTimer);
        clearInterval(this.commandReportTimer);
        this.scanTimer = undefined;
        this.failPendingCallbacks();
        if (terminate) this.ws?.terminate();
    }

    isReady() {
        const ws = this.ws;
        return this.connected && ws !== undefined && ws.readyState === ws.OPEN;
    }

    getAddress() {
        return this.isReady() ? this.ws?.url : undefined;
    }

    sendAndForget(message: IntifaceSendMessageWithType) {
        this.assertReady();
        if (message.type === 'OutputCmd') this.recentlySentCommands++;
        const {id, packet} = this.preparePacket(message, message.type !== 'OutputCmd');
        this.sendPacket(packet);
        return id;
    }

    private attachSocketHandlers() {
        const ws = this.ws!;
        ws.on('message', data => this.onReceive(data));
        ws.on('error', error => {
            if (!this.disposed) this.logger.log('error', error);
        });
        ws.on('close', () => {
            if (this.disposed) return;
            this.dispose(false);
            this.emit('close');
        });
        this.logger.log('Opening websocket ...');
    }

    private async waitForOpen(signal: AbortSignal) {
        const ws = this.ws!;
        const cleanupController = new AbortController();
        const waitSignal = AbortSignal.any([signal, cleanupController.signal]);
        try {
            await Promise.race([
                once(ws, 'open', {signal: waitSignal}),
                once(ws, 'close', {signal: waitSignal}).then(() => {
                    throw new Error('Socket closed before opening');
                }),
            ]);
        } finally {
            cleanupController.abort();
        }
    }

    private startScanTimer() {
        this.scanTimer = setInterval(() => {
            if (this.scanInProgress || !this.isReady()) return;
            this.scanInProgress = true;
            void this.scan()
                .catch(error => this.logger.log('Error while scanning', error))
                .finally(() => {
                    this.scanInProgress = false;
                });
        }, 1000);
    }

    private async scan() {
        await this.request({type: 'StartScanning'});
        await new Promise(resolve => setTimeout(resolve, 10_000));
        if (this.isReady()) await this.request({type: 'StopScanning'});
    }

    private async request(message: IntifaceSendMessageWithType, signal?: AbortSignal) {
        const {id, packet} = this.preparePacket(message);
        const {promise, resolve, reject} = Promise.withResolvers<IntifaceMessageWithType>();
        const complete = (result: PendingResponse) => {
            this.callbacks.delete(id);
            clearTimeout(timeout);
            signal?.removeEventListener('abort', abort);
            if (result.ok) resolve(result.data);
            else reject(result.error);
        };
        const abort = () => complete({ok: false, error: signal?.reason ?? new Error('Connection aborted')});
        const timeout = setTimeout(() => complete({ok: false, error: new Error('Timeout after 5000ms')}), 5000);
        signal?.addEventListener('abort', abort, {once: true});
        if (signal?.aborted) abort();
        else {
            this.callbacks.set(id, complete);
            try {
                this.sendPacket(packet);
            } catch (error) {
                complete({ok: false, error});
            }
        }
        return await promise;
    }

    private preparePacket(message: IntifaceSendMessageWithType, log = true) {
        const {type, ...params} = message;
        if (++this.lastMessageId > 1_000_000_000) this.lastMessageId = 1;
        const id = typia.assert<IntifaceUInt32>(this.lastMessageId);
        const payload = {Id: id, ...params};
        if (log) this.logger.log('->', type, payload);
        return {id, packet: [{[type]: payload}] as IntifacePacket};
    }

    private sendPacket(packet: IntifacePacket) {
        const ws = this.ws;
        if (!ws || ws.readyState !== ws.OPEN) throw new Error('Not connected');
        ws.send(JSON.stringify(packet));
    }

    private assertReady() {
        if (!this.isReady()) throw new Error('Not connected');
    }

    private onReceive(data: WebSocket.RawData) {
        try {
            const packet = typia.assert<IntifacePacket>(JSON.parse(data.toString()) as unknown);
            for (const message of packet) {
                for (const [type, payload] of Object.entries(message)) {
                    if (payload !== undefined) this.handlePacket(type, payload);
                }
            }
        } catch (error) {
            this.logger.log('Ignoring malformed Intiface packet', error);
        }
    }

    private handlePacket(type: string, message: IntifaceMessagePayload) {
        const response: IntifaceMessageWithType = {type, ...message};
        if (type !== 'Ok') this.logger.log('<-', response);

        if (type === 'DeviceList') {
            if (!typia.is<IntifaceDeviceListPayload>(message)) {
                this.logger.log('Ignoring malformed DeviceList payload', response);
                return;
            }
            this.initialDeviceList = message.Devices;
            if (this.connected) this.emit('deviceList', message.Devices);
        }

        const callback = message.Id ? this.callbacks.get(message.Id) : undefined;
        if (!callback) return;
        if (type === 'Error' && typia.is<IntifaceErrorPayload>(message)) {
            callback({ok: false, error: new Error(`Intiface error ${message.ErrorCode}: ${message.ErrorMessage}`)});
        } else {
            callback({ok: true, data: response});
        }
    }

    private failPendingCallbacks() {
        for (const callback of this.callbacks.values()) {
            callback({ok: false, error: new Error('Connection closed')});
        }
        this.callbacks.clear();
    }
}
