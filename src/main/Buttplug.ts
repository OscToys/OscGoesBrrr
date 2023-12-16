import WebSocket from 'ws';
import {default as decodeType} from '../common/decodeType';
import {ButtplugMessageWithType, Device} from "./ButtplugSpec";
import {ButtplugPacket} from "./ButtplugSpec";
import EventEmitter from "events";
import TypedEmitter from "typed-emitter";
import OscConnection from "./OscConnection";
import LoggerService, {SubLogger} from "./services/LoggerService";
import type {Config} from "../common/configTypes";
import OgbMath from "./utils/OgbMath";
import OgbConfigService from "./services/OgbConfigService";
import {Service} from "typedi";

type MyEvents = {
    addFeature: (device: DeviceFeature) => void,
    removeFeature: (device: DeviceFeature) => void
}

@Service()
export default class Buttplug extends (EventEmitter as new () => TypedEmitter<MyEvents>) {
    private readonly logger;
    lastMessageId = 0;
    activeCallbacks = new Map<number,(msg:ButtplugMessageWithType|null,error?:any)=>void>();
    features = new Set<DeviceFeature>();
    usedDeviceIds = new Set<string>();
    recentlySentCmds = 0;
    retryTimeout : ReturnType<typeof setInterval> | undefined;
    ws: WebSocket | undefined;

    constructor(
        logger: LoggerService,
        private config: OgbConfigService
    ) {
        super();
        this.logger = logger.get('Buttplug');
        this.retry();
        this.scanForever();

        setInterval(() => {
            if (this.recentlySentCmds > 0) {
                this.logger.log("Sent " + this.recentlySentCmds + " high-frequency commands in the last 15 seconds");
                this.recentlySentCmds = 0;
            }
        }, 15000);
    }

    public getIntifaceConfig() {
        return this.config.get().outputs.intiface;
    }

    connectionTimeout: ReturnType<typeof setTimeout> | undefined;
    retry() {
        clearTimeout(this.retryTimeout);
        this.retryTimeout = undefined;
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = undefined;

        this.terminate();

        const url = OscConnection.parsePort(this.getIntifaceConfig().address, '127.0.0.1', 12345);
        this.logger.log("Opening connection to server at " + url);

        let ws;
        try {
            ws = this.ws = new WebSocket(url);
        } catch(e) {
            this.logger.log('Init exception', e);
            this.delayRetry();
            return;
        }
        ws.on('message', data => this.onReceive(data));
        ws.on('error', e => {
            this.logger.log('error', e);
            this.delayRetry();
        })
        ws.on('close', e => {
            for (const callback of this.activeCallbacks.values()) {
                callback(null, new Error("Connection closed"));
            }
            this.clearDevices();
            this.logger.log('Connection closed');
            this.delayRetry();
        })
        ws.on('open', async () => {
            this.clearDevices();
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = undefined;
            this.logger.log('open');
            await this.send({
                type: 'RequestServerInfo',
                ClientName: 'OscGoesBrrr',
                MessageVersion: 3,
            });
            await this.send({ type: 'RequestDeviceList' });
        });

        this.logger.log('Opening websocket ...');
        this.connectionTimeout = setTimeout(() => {
            this.logger.log('Timed out while opening socket');
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
            this.logger.log('<-', params);
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
            this.logger.log('->', type, newArgs);
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
        this.logger.log('retrying shortly ...');
        this.retryTimeout = setTimeout(() => this.retry(), 1000);
    }

    async scanForever() {
        while(true) {
            try {
                await this.scan();
            } catch(e) {
                this.logger.log('Error while scanning', e);
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
            this.addFeature(new DeviceFeature(this, id + '-' + featureId++, id, 'vibrate', d.DeviceIndex, i, this, scalarCmds[i]!.ActuatorType));
        }
        const linearCmds = d.DeviceMessages?.LinearCmd ?? [];
        for (let i = 0; i < linearCmds.length; i++) {
            this.addFeature(new DeviceFeature(this, id + '-' + featureId++, id, 'linear', d.DeviceIndex, i, this, ''));
        }
        const rotateCmds = d.DeviceMessages?.RotateCmd ?? [];
        for (let i = 0; i < rotateCmds.length; i++) {
            this.addFeature(new DeviceFeature(this, id + '-' + featureId++, id, 'rotate', d.DeviceIndex, i, this, ''));
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
    lastLevel = 0;
    private linearTarget = 0;
    private linearVelocity = 0;
    private lastLinearSuck = 0;

    constructor(
        private readonly owner: Buttplug,
        public readonly id: string,
        public readonly deviceId: string,
        public readonly type: 'linear'|'vibrate'|'rotate',
        public readonly bioDeviceIndex: number,
        private readonly bioSubIndex: number,
        private readonly parent: Buttplug,
        private readonly actuatorType: string
    ) {
    }

    private setLevelRaw(level: number, duration = 0) {
        if (this.type == 'linear') {
            this.parent.send({
                type: 'LinearCmd',
                DeviceIndex: this.bioDeviceIndex,
                Vectors: [{Index: this.bioSubIndex, Duration: duration, Position: level}]
            });
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

    public setLevel(level: number, backward: boolean, now: number, timeDelta: number) {
        const config = this.owner.getIntifaceConfig();

        if (this.type == 'linear') {
            const linearConfig = this.owner.getIntifaceConfig().linear;

            const timeDeltaSeconds = timeDelta / 1000;
            const oldVelocity = this.linearVelocity;
            let maxVelocity = linearConfig?.maxVelocity ?? 3;
            let maxAcceleration = linearConfig?.maxAcceleration ?? 20;
            const durationMult = 1;
            const restingPos = OgbMath.clamp(linearConfig?.restingPosition ?? 0, 0, 1);
            const restingTime = (linearConfig?.restingTime ?? 3) * 1000;

            let targetPosition = 1 - level;
            const min = linearConfig?.minPosition ?? 0;
            const max = linearConfig?.maxPosition ?? 1;
            targetPosition = OgbMath.remap(targetPosition, 0, 1, min, max);

            if (level > 0) {
                this.lastLinearSuck = now;
            } else if (this.lastLinearSuck < now - restingTime) {
                targetPosition = restingPos;
                maxAcceleration = 999;
                maxVelocity = Math.min(maxVelocity, 1);
            }

            targetPosition = OgbMath.clamp(targetPosition, 0, 1);

            const currentPosition = this.lastLevel;
            const absDistanceRequiredToStopSmoothly = Math.pow(oldVelocity, 2) / (2 * maxAcceleration);
            const stopPosition = currentPosition + (oldVelocity < 0 ? -1 : 1) * absDistanceRequiredToStopSmoothly;
            const fromStopPositionToTarget = targetPosition - stopPosition;

            // Test what would happen if we accelerate or decelerate
            let newVelocityIfWeAdd = oldVelocity + maxAcceleration * timeDeltaSeconds;
            let newVelocityIfWeSubtract = oldVelocity - maxAcceleration * timeDeltaSeconds;
            if (Math.abs(newVelocityIfWeAdd) > maxVelocity) newVelocityIfWeAdd = (newVelocityIfWeAdd > 0 ? 1 : -1) * maxVelocity;
            if (Math.abs(newVelocityIfWeSubtract) > maxVelocity) newVelocityIfWeSubtract = (newVelocityIfWeSubtract > 0 ? 1 : -1) * maxVelocity;

            // If we'd hit the target with a velocity in between the accelerate and decelerate options, lock to the target
            const newPosIfWeAdd = currentPosition + newVelocityIfWeAdd * timeDeltaSeconds;
            const newPosIfWeSubtract = currentPosition + newVelocityIfWeSubtract * timeDeltaSeconds;
            let newVelocity;
            if (targetPosition == newPosIfWeAdd) {
                newVelocity = newVelocityIfWeAdd;
            } else if (targetPosition == newPosIfWeSubtract) {
                newVelocity = newVelocityIfWeSubtract;
            } else if (newPosIfWeAdd < targetPosition != newPosIfWeSubtract < targetPosition) {
                newVelocity = (targetPosition - currentPosition) / timeDeltaSeconds;
            } else {
                // otherwise, head toward the target
                newVelocity = fromStopPositionToTarget > 0 ? newVelocityIfWeAdd : newVelocityIfWeSubtract;
            }

            let newPosition = currentPosition + newVelocity * timeDeltaSeconds;

            //console.log(`target=${targetPosition} velocity=${this.linearVelocity} stopDistance=${absDistanceRequiredToStopSmoothly} stopPos=${stopPosition} stopDelta=${fromStopPositionToTarget} pos=${currentPosition}->${newPosition} add=${add}`);
            if (newPosition > 1) {
                newPosition = 1;
                newVelocity = 0;
            }
            if (newPosition < 0) {
                newPosition = 0;
                newVelocity = 0;
            }
            //newPosition = level;
            if (this.lastLevel != newPosition) {
                this.setLevelRaw(newPosition, Math.round(timeDelta * durationMult));
            }

            this.linearVelocity = newVelocity;
            this.linearTarget = targetPosition;

            const debug = linearConfig?.debugLog ?? false;
            if (debug) {
                const width = 60;
                const currentPos = Math.floor(newPosition * width);
                const targetPos = Math.floor(targetPosition * width);
                let out = '';
                out += '|';
                for (let i = 0; i < width; i++) {
                    if (i == currentPos) out += '#';
                    else if (i == targetPos) out += '*';
                    else out += ' ';
                }
                out += '|';
                console.log(out);
            }
            return;
        }

        if (this.type == 'rotate') {
            this.setLevelRaw(level * (backward ? -1 : 1));
            return;
        }

        this.setLevelRaw(level);
    }
}
