import Buttplug from "./Buttplug";
import {OscValue} from "./OscConnection";
import OscConnection from "./OscConnection";
import GameDevice from "./GameDevice";
import {DeviceFeature} from "./Buttplug";
import ConfigService from "./services/ConfigService";
import {getDefaultLinearActuatorConfig, getDefaultOutput, Output, OutputLinkMutator} from "../common/configTypes";
import clamp from "../common/clamp";
import {Service} from "typedi";

@Service()
export default class Bridge {
    private fftValue = 0;
    private lastFftReceived = 0;
    private gameDevices = new Map<string,GameDevice>();
    private outputs = new Set<BridgeOutput>();

    constructor(
        private osc: OscConnection,
        private buttConnection: Buttplug,
        private configService: ConfigService
    ) {
        this.osc.on('add', this.onOscAddKey);
        this.osc.on('clear', this.onOscClear);
        this.buttConnection.on('addFeature', f => {
            this.outputs.add(new BridgeOutput(f,this.configService,this.osc));
        });
        this.buttConnection.on('removeFeature', f => {
            for (const output of this.outputs) {
                if (output.bioFeature == f) this.outputs.delete(output);
            }
        })

        setInterval(() => {
            this.pushToBio();
        }, 1000/15);
    }

    onOscAddKey = (key: string, value: OscValue) => {
        const split = key.split('/');
        if (split[0] == 'OGB' || split[0] == 'TPS_Internal') {
            const isTps = split[0] == 'TPS_Internal';
            const type = split[1];
            const id = split[2];
            const contactType = split.slice(3).join('/');
            if (!type || !id || !contactType) return;
            const key = isTps + '__' + type + '__' + id;
            let gameDevice = this.gameDevices.get(key);
            if (!gameDevice) {
                gameDevice = new GameDevice(type, id, isTps);
                this.gameDevices.set(key, gameDevice);
            }
            gameDevice.addKey(contactType, value);
        }
        if (split[0] == 'VFH' && split[1] == 'Zone') {
            const type = split[2];
            const id = split[3];
            const contactType = split[4];
            if (!type || !id || !contactType) return;
            const key = type + '__' + id;
            let gameDevice = this.gameDevices.get(key);
            if (!gameDevice) {
                gameDevice = new GameDevice(type, id, false);
                this.gameDevices.set(key, gameDevice);
            }
            gameDevice.addKey(contactType, value);
        }
    }

    onOscClear = () => {
        this.gameDevices.clear();
    }

    getGameDevices() {
        const allGameDevices = Array.from(this.gameDevices.values());
        const hasOGBDevice = allGameDevices.some(device => !device.isTps);
        return Array.from(this.gameDevices.values())
            .filter(device => !hasOGBDevice || !device.isTps);
    }

    getOutputs() {
        return this.outputs;
    }

    pushToBio() {
        let maxLevel = 0;
        const gameDevices = this.getGameDevices();
        const audioLevel = this.lastFftReceived > Date.now() - 1000 ? this.fftValue : undefined;
        for (const output of this.outputs) {
           output.pushToBio(gameDevices, audioLevel);
           maxLevel = Math.max(maxLevel, output.lastLevel);
        }

        this.osc.clearDeltas();
        const sendParam = this.configService.getCached().maxLevelParam;
        if (sendParam) {
            this.osc.send(sendParam, maxLevel);
        }
    }

    receivedFft(level: number) {
        this.fftValue = level;
        this.lastFftReceived = Date.now();
    }
}

interface RelevantSource {
    value: number;
    motionBased: boolean;
}

export class BridgeOutput {
    private lastSources: number[] = [];
    public lastLevel = 0;
    private lastPushTime = 0;
    private linearTarget = 0;
    private linearVelocity = 0;
    private lastLinearSuck = 0;

    constructor(
        public readonly bioFeature: DeviceFeature,
        private readonly configService: ConfigService,
        private readonly osc: OscConnection
    ) {
        //console.log("New b.io feature loaded into BridgeOutput: " + this.bioFeature.id);
    }

    private getConfig(): Output {
        return {
            ...getDefaultOutput(),
            id: this.bioFeature.id,
            ...this.configService.getOutput(this.bioFeature.id),
        };
    }

    private hasMotionBased(mutators: OutputLinkMutator[]) {
        return mutators.some(mutator => mutator.kind === 'motionBased');
    }

    private applyMutators(value: number, mutators: OutputLinkMutator[]) {
        let out = value;
        const deadZone = mutators.find(
            (mutator): mutator is Extract<OutputLinkMutator, {kind: 'deadZone'}> => mutator.kind === 'deadZone',
        );
        if (deadZone) {
            if (deadZone.level >= 1) {
                out = 0;
            } else if (deadZone.level > 0) {
                out = (out - deadZone.level) / (1 - deadZone.level);
            }
        }
        const scale = mutators.find(
            (mutator): mutator is Extract<OutputLinkMutator, {kind: 'scale'}> => mutator.kind === 'scale',
        );
        if (scale) out = out * scale.scale;
        return out;
    }

    getRelevantSources(gameDevices: GameDevice[], audioLevel: number | undefined, config: Output): RelevantSource[] {
        const links = config.links;
        const entries = this.osc.entries();
        return links.map((link) => {
            if (link.kind === 'constant') {
                if (this.bioFeature.type === 'linear') return {value: 0, motionBased: false};
                return {
                    value: link.level,
                    motionBased: false,
                };
            }
            if (link.kind === 'systemAudio') {
                if (this.bioFeature.type === 'linear') return {value: 0, motionBased: false};
                const rawAudio = audioLevel ?? 0;
                const transformed = this.applyMutators(rawAudio, link.mutators);
                return {
                    value: transformed,
                    motionBased: false,
                };
            }
            if (link.kind === 'vrchat.avatarParameter') {
                const parameter = link.parameter.trim();
                if (!parameter) return {value: 0, motionBased: false};
                const valueUnknown = entries.get(parameter)?.get();
                const raw = (typeof valueUnknown == 'number') ? valueUnknown : 0;
                const transformed = this.applyMutators(raw, link.mutators);
                return {
                    value: transformed,
                    motionBased: this.hasMotionBased(link.mutators),
                };
            }
            let best: RelevantSource = {value: 0, motionBased: this.hasMotionBased(link.mutators)};
            if (link.kind === 'vrchat.sps.plug' || link.kind === 'vrchat.sps.socket' || link.kind === 'vrchat.sps.touch') {
                for (const gameDevice of gameDevices) {
                    for (const source of gameDevice.getSources(link)) {
                        const transformed = this.applyMutators(source.level, link.mutators);
                        const candidate: RelevantSource = {
                            value: transformed,
                            motionBased: this.hasMotionBased(link.mutators),
                        };
                        if (candidate.value > best.value) {
                            best = candidate;
                        }
                    }
                }
                }
            return best;
        });
    }

    pushToBio(gameDevices: GameDevice[], audioLevel: number | undefined) {
        const now = Date.now();
        const timeDeltaReal = now - this.lastPushTime;
        const config = this.getConfig();
        const updatesPerSecond = config.updatesPerSecond ?? 0;
        if (updatesPerSecond > 0 && timeDeltaReal < (1000 / updatesPerSecond)) return;
        const timeDelta = clamp(timeDeltaReal, 0, 250); // safety limited

        const sources = this.getRelevantSources(gameDevices, audioLevel, config);
        let level = 0;
        let motionBasedBackward = false;
        for (let linkIndex = 0; linkIndex < sources.length; linkIndex++) {
            const source = sources[linkIndex] ?? {value: 0, motionBased: false};
            const value = source.value;
            if (this.bioFeature.type == 'linear') {
                level = Math.max(level, value);
            } else if (source.motionBased) {
                const lastValue = this.lastSources[linkIndex];
                if (lastValue !== undefined) {
                    const delta = value - lastValue;
                    const diffPerSecond = Math.abs(delta) / timeDelta * 1000;
                    const intensity = diffPerSecond / 5;
                    if (intensity > level) {
                        level = intensity;
                        motionBasedBackward = delta < 0;
                    }
                    level = Math.max(level, intensity);
                }
            } else {
                level = Math.max(level, value);
            }
        }

        level = clamp(level, 0, 1);

        if (this.bioFeature.type == 'linear') {
            const linearDefaults = getDefaultLinearActuatorConfig();
            const linearConfig = {
                ...linearDefaults,
                ...(config.linear ?? {}),
            };
            const timeDeltaSeconds = timeDelta / 1000;
            const oldVelocity = this.linearVelocity;
            let maxVelocity = linearConfig.maxv;
            let maxAcceleration = linearConfig.maxa;
            const durationMult = linearConfig.durationMult;
            const restingPos = clamp(linearConfig.restingPos, 0, 1);
            const restingTime = linearConfig.restingTime * 1000;

            let targetPosition = 1 - level;
            const min = linearConfig.min;
            const max = linearConfig.max;
            targetPosition = this.remap(targetPosition, 0, 1, min, max);

            if (level > 0) {
                this.lastLinearSuck = now;
            } else if (this.lastLinearSuck < now - restingTime) {
                targetPosition = restingPos;
                maxAcceleration = 999;
                maxVelocity = clamp(maxVelocity, 0, 1);
            }

            targetPosition = clamp(targetPosition, 0, 1);

            const currentPosition = this.bioFeature.lastLevel;
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
            if (this.bioFeature.lastLevel != newPosition) {
                this.bioFeature.setLevel(newPosition, Math.round(timeDelta * durationMult));
            }

            this.linearVelocity = newVelocity;
            this.linearTarget = targetPosition;

            const debug = false;
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
        } else {
            level = clamp(level, 0, 1);

            if (this.bioFeature.type == 'rotate') {
                this.bioFeature.setLevel(level * (motionBasedBackward ? -1 : 1));
            } else {
                this.bioFeature.setLevel(level);
            }
        }

        this.lastLevel = this.bioFeature.lastLevel;
        this.lastSources = sources.map((source) => source?.value ?? 0);
        this.lastPushTime = now;
    }

    remap(num: number, fromMin: number, fromMax: number, toMin: number, toMax: number) {
        const normalized = (num - fromMin) / (fromMax-fromMin);
        return normalized * (toMax-toMin) + toMin;
    }

    getCurrentLevel() {
        return this.lastLevel;
    }

    getLastSources() {
        return [...this.lastSources];
    }
}
