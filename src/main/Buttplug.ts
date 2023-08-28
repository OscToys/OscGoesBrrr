import WebSocket from 'ws';
import {default as decodeType} from '../common/decodeType';
import type {ButtplugMessageWithType, Device} from "./ButtplugSpec";
import {ButtplugPacket} from "./ButtplugSpec";
import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";
import OscConnection from "./OscConnection";

type MyEvents = {
    addFeature: (device: DeviceFeature) => void,
    removeFeature: (device: DeviceFeature) => void
}

export default class Buttplug extends (EventEmitter as new () => TypedEmitter<MyEvents>) {
    log;
    lastMessageId = 0;
    activeCallbacks = new Map<number,(msg:ButtplugMessageWithType|null,error?:any)=>void>();
    features = new Set<DeviceFeature>();
    usedDeviceIds = new Set<string>();
    recentlySentCmds = 0;
    retryTimeout : ReturnType<typeof setInterval> | undefined;
    ws: WebSocket | undefined;
    configMap: Map<string,string>;

    constructor(
        logger: (...args: unknown[]) => void,
        configMap: Map<string,string>
    ) {
        super();
        this.log = logger;
        this.configMap = configMap;
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

        if (this.configMap.get('bio.wss') != "true") {
            const [bAddress, bPort] = OscConnection.parsePort(this.configMap.get('bio.port'), '127.0.0.1', 12345);
            let address = 'ws://' + `${bAddress}:${bPort}`;
        } else {
            let address = 'wss://' + this.configMap.get('bio.port');
        }
        this.log("Opening connection to server at " + address);

        let ws;
        try {
            ws = this.ws = new WebSocket(address);
        } catch(e) {
            this.log('Init exception', e);
            this.delayRetry();
            return;
        }
        ws.on('message', data => this.onReceive(data));
        ws.on('error', e => {
            this.log('error', e);
            this.delayRetry();
        })
        ws.on('close', e => {
            for (const callback of this.activeCallbacks.values()) {
                callback(null, new Error("Connection closed"));
            }
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
                ClientName: 'OscGoesBrrr',
                MessageVersion: 3,
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
        if (type === 'ScalarCmd' || type === 'LinearCmd' || type == 'RotateCmd' || type == 'FleshlightLaunchFW12Cmd') {
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
            this.activeCallbacks.set(id, (data, error) => {
                this.activeCallbacks.delete(id);
                clearTimeout(timeout);
                if (error) reject(error);
                else resolve(data);
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
        const scalarCmds = d.DeviceMessages?.ScalarCmd ?? [];
        for (let i = 0; i < scalarCmds.length; i++) {
            this.addFeature(new DeviceFeature(id + '-' + featureId++, id, 'vibrate', d.DeviceIndex, i, this, scalarCmds[i]!.ActuatorType));
        }
        const linearCmds = d.DeviceMessages?.LinearCmd ?? [];
        for (let i = 0; i < linearCmds.length; i++) {
            this.addFeature(new DeviceFeature(id + '-' + featureId++, id, 'linear', d.DeviceIndex, i, this, ''));
        }
        const rotateCmds = d.DeviceMessages?.RotateCmd ?? [];
        for (let i = 0; i < rotateCmds.length; i++) {
            this.addFeature(new DeviceFeature(id + '-' + featureId++, id, 'rotate', d.DeviceIndex, i, this, ''));
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
    readonly type;
    readonly bioDeviceIndex;
    private readonly bioSubIndex;
    private readonly parent;
    private readonly actuatorType;
    lastLevel = 0;

    constructor(fullFeatureId: string, deviceId: string, type: 'linear'|'vibrate'|'rotate', bioDeviceIndex: number, bioSubIndex: number, parent: Buttplug, actuatorType: string) {
        this.id = fullFeatureId;
        this.deviceId = deviceId;
        this.type = type;
        this.bioDeviceIndex = bioDeviceIndex;
        this.bioSubIndex = bioSubIndex;
        this.parent = parent;
        this.actuatorType = actuatorType;
    }

    setLevel(level: number, duration = 0, customCalc = false, customCalcClamp = false) {
        if (this.type == 'linear') {
            if (customCalc) {
                const absDistance = Math.abs(this.lastLevel - level);
                if (absDistance > 0) {
                    let speed = Math.pow((duration * 90) / (absDistance * 100), -1.05) * 250;
                    speed = Math.round(speed * 99);
                    if (customCalcClamp) {
                        if (speed < 20) speed = 20;
                        if (speed > 80) speed = 80;
                    }
                    this.parent.send({
                        type: 'FleshlightLaunchFW12Cmd',
                        DeviceIndex: this.bioDeviceIndex,
                        Speed: speed,
                        Position: Math.round(level * 99)
                    });
                }
            } else {
                this.parent.send({
                    type: 'LinearCmd',
                    DeviceIndex: this.bioDeviceIndex,
                    Vectors: [{Index: this.bioSubIndex, Duration: duration, Position: level}]
                });
            }
        } else if (this.type == 'rotate') {
            this.parent.send({
                type: 'RotateCmd',
                DeviceIndex: this.bioDeviceIndex,
                Rotations: [{Index: this.bioSubIndex, Speed: Math.abs(level), Clockwise: level >= 0}]
            });
        } else {
            if (this.actuatorType != 'Constrict') {
                this.parent.send({
                    type: 'ScalarCmd',
                    DeviceIndex: this.bioDeviceIndex,
                    Scalars: [{Index: this.bioSubIndex, Scalar: level, ActuatorType: this.actuatorType}]
                });
            }
        }
        this.lastLevel = level;
    }
}
