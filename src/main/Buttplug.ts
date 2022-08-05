import WebSocket from 'ws';
import {default as decodeType} from '../common/decodeType';
import type {ButtplugMessageWithType, Device} from "./ButtplugSpec";
import {ButtplugPacket} from "./ButtplugSpec";
import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";

type MyEvents = {
    addFeature: (device: DeviceFeature) => void,
    removeFeature: (device: DeviceFeature) => void
}

export default class Buttplug extends (EventEmitter as new () => TypedEmitter<MyEvents>) {
    log;
    lastMessageId = 0;
    activeCallbacks = new Map<number,(msg:ButtplugMessageWithType)=>void>();
    features = new Set<DeviceFeature>();
    usedDeviceIds = new Set<string>();
    recentlySentCmds = 0;
    retryTimeout : ReturnType<typeof setInterval> | undefined;
    ws: WebSocket | undefined;

    constructor(logger: (...args: unknown[]) => void) {
        super();
        this.log = logger;
        this.retry();
        this.scanForever();

        setInterval(() => {
            if (this.recentlySentCmds > 0) {
                this.log("Sent " + this.recentlySentCmds + " high-frequency commands in the last 15 seconds");
                this.recentlySentCmds = 0;
            }
        }, 15000);
    }

    connectionTimeout: ReturnType<typeof setTimeout> | undefined;
    retry() {
        clearTimeout(this.retryTimeout);
        this.retryTimeout = undefined;
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = undefined;

        this.terminate();
        const ws = this.ws = new WebSocket('ws://127.0.0.1:12345');
        ws.on('message', data => this.onReceive(data));
        ws.on('error', e => {
            this.log('error', e);
            this.delayRetry();
        })
        ws.on('close', e => {
            this.clearDevices();
            this.log('Connection closed');
            this.delayRetry();
        })
        ws.on('open', async () => {
            this.clearDevices();
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = undefined;
            this.log('open');
            await this.send({
                type: 'RequestServerInfo',
                ClientName: 'OSC Goes Brrr',
                MessageVersion: 1
            });
            await this.send({ type: 'RequestDeviceList' });
        });

        this.log('Opening websocket ...');
        this.connectionTimeout = setTimeout(() => {
            this.log('Timed out while opening socket');
            this.delayRetry();
        }, 3000);
    }

    onReceive(data: WebSocket.RawData) {
        const jsonStr = data.toString();
        const json = JSON.parse(jsonStr);
        const packet = decodeType(json, ButtplugPacket);
        for (const message of packet) {
            for (const [type,body] of Object.entries(message)) {
                this.handlePacket({
                    type: type,
                    ...body
                } as any);
            }
        }
    }
    handlePacket(params: ButtplugMessageWithType) {
        const type = params.type;

        if (type !== 'Ok') {
            this.log('<-', params);
        }

        if (type === 'DeviceRemoved') {
            this.removeDevice(params.DeviceIndex);
        } else if (type === 'DeviceAdded') {
            this.addDevice(params);
        } else if (type === 'DeviceList') {
            for (const d of params.Devices) {
                this.addDevice(d);
            }
        }

        const id = ('Id' in params) ? params.Id : 0;
        if (id) {
            const cb = this.activeCallbacks.get(id);
            if (!cb) return;
            cb(params);
        }
    }

    async send(message: ButtplugMessageWithType) {
        const { type, ...params } = message;
        if (!this.wsReady() || !this.ws) return;
        const id = ++this.lastMessageId;
        if (this.lastMessageId > 1_000_000_000) this.lastMessageId = 1;
        const newArgs = {
            Id: id,
            ...params
        };
        if (type === 'VibrateCmd' || type === 'LinearCmd') {
            this.recentlySentCmds++;
        } else {
            this.log('->', type, newArgs);
        }

        const json: ButtplugPacket = [{[type]: newArgs}];
        this.ws.send(JSON.stringify(json));

        return await new Promise((resolve,reject) => {
            const timeout = setTimeout(() => {
                this.activeCallbacks.delete(id);
                reject("Timeout after 5000ms");
            }, 5000);
            this.activeCallbacks.set(id, data => {
                this.activeCallbacks.delete(id);
                clearTimeout(timeout);
                resolve(data);
            });
        });
    }

    wsReady() {
        return this.ws && this.ws.readyState === this.ws.OPEN;
    }

    terminate() {
        if (this.ws) {
            this.ws.terminate();
            this.ws = undefined;
        }
    }

    delayRetry() {
        if (this.retryTimeout) return;
        this.terminate();
        this.log('retrying shortly ...');
        this.retryTimeout = setTimeout(() => this.retry(), 1000);
    }

    async scanForever() {
        while(true) {
            try {
                await this.scan();
            } catch(e) {
                this.log('Error while scanning', e);
            }
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    async scan() {
        if (!this.wsReady()) return;
        await this.send({type: 'StartScanning'});
        await new Promise(r => setTimeout(r, 10000));
        await this.send({type: 'StopScanning'});
    }

    private clearDevices() {
        for (const device of this.features.values()) {
            this.emit('removeFeature', device);
        }
        this.usedDeviceIds.clear();
        this.features.clear();
    }

    private removeDevice(bioDeviceIndex: number) {
        const removing = Array.from(this.features).filter(d => d.bioDeviceIndex == bioDeviceIndex);
        for (const feature of removing) {
            this.emit('removeFeature', feature);
            this.usedDeviceIds.delete(feature.deviceId);
            this.features.delete(feature);
        }
    }

    addDevice(d: Device) {
        const name = d.DeviceName;
        const baseId = name.toLowerCase().replaceAll(' ', '');
        let id;
        for (let i = 0;; i++) {
            id = baseId + (i === 0 ? '' : i);
            if (!this.usedDeviceIds.has(id)) break;
        }
        this.usedDeviceIds.add(id);

        let featureId = 0;
        const vibratorCount = d.DeviceMessages?.VibrateCmd?.FeatureCount ?? 0;
        for (let i = 0; i < vibratorCount; i++) {
            this.addFeature(new DeviceFeature(id + '-' + featureId++, id, false, d.DeviceIndex, i, this));
        }
        const linearCount = d.DeviceMessages?.LinearCmd?.FeatureCount ?? 0;
        for (let i = 0; i < linearCount; i++) {
            this.addFeature(new DeviceFeature(id + '-' + featureId++, id, true, d.DeviceIndex, i, this));
        }
    }

    private addFeature(feature: DeviceFeature) {
        this.features.add(feature);
        this.emit('addFeature', feature);
    }

    getDevices() {
        return this.features;
    }
}

export class DeviceFeature {
    readonly id;
    readonly deviceId;
    readonly linear;
    readonly bioDeviceIndex;
    private readonly bioSubIndex;
    private readonly parent;
    lastLevel = 0;

    constructor(fullFeatureId: string, deviceId: string, linear: boolean, bioDeviceIndex: number, bioSubIndex: number, parent: Buttplug) {
        this.id = fullFeatureId;
        this.deviceId = deviceId;
        this.linear = linear;
        this.bioDeviceIndex = bioDeviceIndex;
        this.bioSubIndex = bioSubIndex;
        this.parent = parent;
    }

    setLevel(level: number) {
        this.lastLevel = level;
        if (this.linear) {
            this.parent.send({
                type: 'LinearCmd',
                DeviceIndex: this.bioDeviceIndex,
                Vectors: [ { Index: this.bioSubIndex, Duration: 20, Position: level } ]
            });
        } else {
            this.parent.send({
                type: 'VibrateCmd',
                DeviceIndex: this.bioDeviceIndex,
                Speeds: [{Index: this.bioSubIndex, Speed: level}]
            });
        }
    }
}
