import WebSocket from 'ws';
import {
    ButtplugErrorPayload,
    ButtplugMessageWithType,
    ButtplugSendMessageWithType,
    ButtplugOutputType,
    ButtplugOutputCommand,
    Device,
    ButtplugDeviceListPayload,
    ButtplugFeatureInformation,
    IntifaceDeviceFeatureSelection,
    ButtplugUInt32,
    ButtplugMessagePayload,
} from "./ButtplugSpec";
import {ButtplugPacket} from "./ButtplugSpec";
import LoggerService, {SubLogger} from "./services/LoggerService";
import ConfigService from "./services/ConfigService";
import {Service} from "typedi";
import BackendDataService from "./services/BackendDataService";
import ImportedOutputPromotionService from "./services/migrate/ImportedOutputPromotionService";
import typia from "typia";
import {Result} from "../common/result";
import TypedEventEmitter from "../common/TypedEventEmitter";
import clamp from "../common/clamp";

type DeviceMotionType = 'linear' | 'vibrate' | 'rotate';

const getDeviceMotionTypeFromOutputType = (outputType: ButtplugOutputType): DeviceMotionType => {
    if (outputType === 'Position' || outputType === 'HwPositionWithDuration') return 'linear';
    if (outputType === 'Rotate') return 'rotate';
    return 'vibrate';
};

type MyEvents = {
    addFeature: (device: DeviceFeature) => void,
    removeFeature: (device: DeviceFeature) => void
}

type PendingResponse = Result<ButtplugMessageWithType, unknown>;

@Service()
export default class Buttplug extends TypedEventEmitter<MyEvents> {
    lastMessageId = 0;
    activeCallbacks = new Map<number, (result: PendingResponse) => void>();
    features = new Set<DeviceFeature>();
    recentlySentCmds = 0;
    reconnectTimer?: ReturnType<typeof setTimeout>;
    ws?: WebSocket;
    wsGeneration?: number;
    connectionGeneration = 0;
    connectionTimeout?: ReturnType<typeof setTimeout>;
    scanTimer?: ReturnType<typeof setInterval>;
    scanInProgress = false;
    lastIntifaceAddress?: string;
    private logger: SubLogger;

    constructor(
        private configService: ConfigService,
        private importedOutputPromotionService: ImportedOutputPromotionService,
        private backendDataService: BackendDataService,
        loggerService: LoggerService,
    ) {
        super();
        this.logger = loggerService.get('bioLog');
        this.lastIntifaceAddress = this.configService.getCached().intifaceAddress;
        this.configService.on('changed', (nextConfig) => {
            const nextIntifaceAddress = nextConfig.intifaceAddress;
            if (this.lastIntifaceAddress !== nextIntifaceAddress) {
                this.requestReconnect(0);
            }
            this.lastIntifaceAddress = nextIntifaceAddress;
        });
        this.requestReconnect(0);

        setInterval(() => {
            if (this.recentlySentCmds > 0) {
                this.logger.log("Sent " + this.recentlySentCmds + " high-frequency commands in the last 15 seconds");
                this.recentlySentCmds = 0;
            }
        }, 15000);
    }

    private clearReconnectTimer() {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
    }

    private clearConnectionTimeout() {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = undefined;
    }

    private stopScanTimer() {
        clearInterval(this.scanTimer);
        this.scanTimer = undefined;
    }

    private failPendingCallbacks() {
        for (const callback of this.activeCallbacks.values()) {
            callback({ok: false, error: new Error("Connection closed")});
        }
        this.activeCallbacks.clear();
    }

    private closeSocket() {
        if (!this.ws) return;
        try {
            this.ws.terminate();
        } finally {
            this.ws = undefined;
            this.wsGeneration = undefined;
        }
    }

    private requestReconnect(delayMs = 1000) {
        this.connectionGeneration++;
        this.clearReconnectTimer();
        this.clearConnectionTimeout();
        this.stopScanTimer();
        this.closeSocket();
        this.failPendingCallbacks();
        this.clearDevices();
        const generation = this.connectionGeneration;
        this.logger.log(delayMs > 0 ? 'retrying shortly ...' : 'retrying ...');
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            void this.connect(generation);
        }, delayMs);
    }

    private async connect(generation: number) {
        if (generation !== this.connectionGeneration) return;

        const config = await this.configService.get();
        if (generation !== this.connectionGeneration) return;
        const normalizedUri = config.intifaceAddress ?? 'ws://127.0.0.1:12345';
        let uri;
        try {
            const parsed = new URL(normalizedUri);
            if (parsed.hostname.toLowerCase() === 'localhost') {
                parsed.hostname = '127.0.0.1';
            }
            uri = parsed.toString();
        } catch {
            uri = normalizedUri;
        }
        this.logger.log("Opening connection to server at " + uri);

        let ws;
        try {
            ws = new WebSocket(uri);
        } catch(e) {
            this.logger.log('Init exception', e);
            if (generation === this.connectionGeneration) this.requestReconnect();
            return;
        }
        this.ws = ws;
        this.wsGeneration = generation;

        ws.on('message', data => {
            if (generation !== this.connectionGeneration) return;
            this.onReceive(data);
        });
        ws.on('error', e => {
            if (generation !== this.connectionGeneration) return;
            this.logger.log('error', e);
        })
        ws.on('close', () => {
            if (generation !== this.connectionGeneration) return;
            if (this.ws === ws) {
                this.ws = undefined;
                this.wsGeneration = undefined;
            }
            this.clearConnectionTimeout();
            this.stopScanTimer();
            this.logger.log('Connection closed');
            this.requestReconnect();
        })
        ws.on('open', async () => {
            if (generation !== this.connectionGeneration) {
                ws.terminate();
                return;
            }
            try {
                this.clearConnectionTimeout();
                this.logger.log('open');
                await this.send({
                    type: 'RequestServerInfo',
                    ClientName: 'OscGoesBrrr',
                    ProtocolVersionMajor: 4,
                    ProtocolVersionMinor: 0,
                });
                if (generation !== this.connectionGeneration) return;
                await this.send({ type: 'RequestDeviceList' });
                if (generation !== this.connectionGeneration) return;
                this.startScanTimer(generation);
            } catch (e) {
                this.logger.log('Init handshake failed', e);
                if (generation === this.connectionGeneration) this.requestReconnect();
            }
        });

        this.logger.log('Opening websocket ...');
        this.connectionTimeout = setTimeout(() => {
            if (generation !== this.connectionGeneration) return;
            this.logger.log('Timed out while opening socket');
            this.requestReconnect();
        }, 3000);
    }

    private startScanTimer(generation: number) {
        this.stopScanTimer();
        this.scanTimer = setInterval(() => {
            if (generation !== this.connectionGeneration) return;
            if (this.scanInProgress) return;
            this.scanInProgress = true;
            void this.scan()
                .catch((e) => this.logger.log('Error while scanning', e))
                .finally(() => {
                    this.scanInProgress = false;
                });
        }, 1000);
    }

    onReceive(data: WebSocket.RawData) {
        try {
            const jsonStr = data.toString();
            const json = JSON.parse(jsonStr) as unknown;
            const packet = typia.assert<ButtplugPacket>(json);
            for (const message of packet) {
                for (const [type, payload] of Object.entries(message)) {
                    if (payload === undefined) continue;
                    this.handlePacket(type, payload);
                }
            }
        } catch (e) {
            this.logger.log('Ignoring malformed Buttplug packet', e);
        }
    }
    handlePacket(type: string, message: ButtplugMessagePayload) {
        const response: ButtplugMessageWithType = {
            type,
            ...message,
        };

        if (type !== 'Ok') {
            this.logger.log('<-', response);
        }

        if (type === 'DeviceList') {
            if (!typia.is<ButtplugDeviceListPayload>(message)) {
                this.logger.log('Ignoring malformed DeviceList payload', response);
                return;
            }
            this.syncDevices(message.Devices);
        }

        const id = message.Id;
        if (id) {
            const cb = this.activeCallbacks.get(id);
            if (!cb) return;
            if (type === 'Error' && typia.is<ButtplugErrorPayload>(message)) {
                cb({ok: false, error: new Error(`Buttplug error ${message.ErrorCode}: ${message.ErrorMessage}`)});
                return;
            }
            cb({ok: true, data: response});
        }
    }

    sendAndForget(message: ButtplugSendMessageWithType): ButtplugUInt32 {
        const { type, ...params } = message;
        const isHighFrequencyCommand = type === 'OutputCmd';
        const id = ++this.lastMessageId;
        if (this.lastMessageId > 1_000_000_000) this.lastMessageId = 1;
        const typedId = typia.assert<ButtplugUInt32>(id);
        if (!this.wsReady() || !this.ws) {
            throw new Error("Not connected");
        }
        const newArgs = {
            Id: typedId,
            ...params
        };
        if (isHighFrequencyCommand) {
            this.recentlySentCmds++;
        } else {
            this.logger.log('->', type, newArgs);
        }

        const json: ButtplugPacket = [{[type]: newArgs}];
        try {
            this.ws.send(JSON.stringify(json));
        } catch (error) {
            this.logger.log('Failed to send command', error);
            throw error;
        }
        return typedId;
    }

    async send(message: ButtplugSendMessageWithType): Promise<ButtplugMessageWithType> {
        const id = this.sendAndForget(message);
        return await new Promise<ButtplugMessageWithType>((resolve,reject) => {
            const timeout = setTimeout(() => {
                this.activeCallbacks.delete(id);
                reject(new Error("Timeout after 5000ms"));
            }, 5000);
            this.activeCallbacks.set(id, (result) => {
                this.activeCallbacks.delete(id);
                clearTimeout(timeout);
                if (!result.ok) reject(result.error);
                else resolve(result.data);
            });
        });
    }

    wsReady() {
        return this.ws !== undefined && this.ws.readyState === this.ws.OPEN;
    }

    private async scan() {
        if (!this.wsReady()) return;
        await this.send({type: 'StartScanning'});
        await new Promise(r => setTimeout(r, 10000));
        await this.send({type: 'StopScanning'});
    }

    private clearDevices() {
        for (const device of this.features.values()) {
            this.emit('removeFeature', device);
        }
        this.features.clear();
    }

    private syncDevices(devicesByIndex: Record<string, Device>) {
        this.clearDevices();
        const sorted = Object.values(devicesByIndex).sort((a, b) => a.DeviceIndex - b.DeviceIndex);
        for (const device of sorted) {
            this.addDevice(device);
        }
    }

    addDevice(d: Device) {
        const name = d.DeviceName;
        const features = Object.values(d.DeviceFeatures)
            .sort((a, b) => a.FeatureIndex - b.FeatureIndex);
        for (const rawFeature of features) {
            const featureIndex = rawFeature.FeatureIndex;
            const outputMap = rawFeature.Output;
            if (!outputMap) continue;
            const pick = (key: ButtplugOutputType): ButtplugOutputType | undefined => {
                if (!outputMap[key]) return undefined;
                return key;
            };
            const selected =
                pick('Vibrate')
                ?? pick('Oscillate')
                ?? pick('Constrict')
                ?? pick('Rotate')
                ?? pick('HwPositionWithDuration')
                ?? pick('Position');
            if (!selected) continue;

            const configOutputId = `intiface.${d.DeviceIndex}.${featureIndex}`;
            void this.importedOutputPromotionService.promoteImportedOutputForDeviceFeature(
                d,
                configOutputId,
                rawFeature,
            ).catch((error) => {
                this.logger.log('Failed to persist imported output promotion', error);
            });

            const intifaceSelection: IntifaceDeviceFeatureSelection = {
                device: d,
                feature: rawFeature,
                selectedOutput: selected,
            };
            const feature = new DeviceFeature(
                configOutputId,
                this,
                intifaceSelection,
            );

            this.features.add(feature);
            void this.backendDataService
                .updateDeviceHistory(feature.id, feature.intiface)
                .catch(e => this.logger.log('Failed to update intiface history', e));
            this.emit('addFeature', feature);
        }
    }

    getDevices() {
        return this.features;
    }
}

export class DeviceFeature {
    readonly id;
    readonly type: DeviceMotionType;
    private readonly parent;
    private readonly range;
    readonly intiface;
    lastLevel = 0;

    constructor(
        fullFeatureId: string,
        parent: Buttplug,
        intiface: IntifaceDeviceFeatureSelection,
    ) {
        this.id = fullFeatureId;
        this.type = getDeviceMotionTypeFromOutputType(intiface.selectedOutput);
        this.parent = parent;
        this.intiface = intiface;
        this.range = intiface.feature.Output?.[intiface.selectedOutput]?.Value;
    }

    private toValueRange(normalized: number): number {
        const min = this.range?.[0] ?? 0;
        const max = this.range?.[1] ?? 1;
        const t = clamp(normalized, 0, 1);
        const mapped = Math.round(min + (max - min) * t);
        // If we have any level at all, send at least step 1
        if (t > 0.001 && mapped <= min && max > min) {
            return min + 1;
        }
        return mapped;
    }

    private toSignedValueRange(signedNormalized: number): number {
        const min = this.range?.[0] ?? -1;
        const max = this.range?.[1] ?? 1;
        const t = clamp((signedNormalized + 1) / 2, 0, 1);
        const mapped = Math.round(min + (max - min) * t);
        // If we have any level at all, send at least step 1
        if (signedNormalized > 0.001 && mapped <= 0 && max > 0) {
            return 1;
        }
        if (signedNormalized < -0.001 && mapped >= 0 && min < 0) {
            return -1;
        }
        return mapped;
    }

    setLevel(level: number, duration = 0) {
        const selectedOutput = this.intiface.selectedOutput;
        const command: ButtplugOutputCommand = (() => {
            if (selectedOutput === 'HwPositionWithDuration') {
                return {HwPositionWithDuration: {Value: this.toValueRange(level), Duration: Math.max(0, Math.round(duration))}};
            }
            if (selectedOutput === 'Position') {
                return {Position: {Value: this.toValueRange(level)}};
            }
            if (selectedOutput === 'Rotate') {
                const hasSignedRange = (this.range?.[0] ?? 0) < 0;
                if (hasSignedRange) {
                    return {Rotate: {Value: this.toSignedValueRange(level)}};
                }
                return {Rotate: {Value: this.toValueRange(Math.abs(level))}};
            }
            if (selectedOutput === 'Oscillate') {
                return {Oscillate: {Value: this.toValueRange(level)}};
            }
            if (selectedOutput === 'Constrict') {
                return {Constrict: {Value: this.toValueRange(level)}};
            }
            return {Vibrate: {Value: this.toValueRange(level)}};
        })();

        try {
            this.parent.sendAndForget({
                type: 'OutputCmd',
                DeviceIndex: this.intiface.device.DeviceIndex,
                FeatureIndex: this.intiface.feature.FeatureIndex,
                Command: command,
            });
        } catch {}
        this.lastLevel = level;
    }
}
