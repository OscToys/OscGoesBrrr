import Intiface from "./Intiface";
import {OscValue} from "./OscConnection";
import OscConnection from "./OscConnection";
import GameDevice from "./GameDevice";
import {DeviceFeature} from "./Intiface";
import ConfigService from "./services/ConfigService";
import {
    getDefaultLinearActuatorConfig,
    getDefaultOutput,
    Output,
    OutputLinkAbsoluteDepthMutator,
    OutputLinkMutator,
} from "../common/configTypes";
import clamp from "../common/clamp";
import {Service} from "typedi";

/** VRChat always provides this parameter, holding the player's current eye height in meters. */
const EYE_HEIGHT_PARAMETER = 'EyeHeightAsMeters';

/** Only used if the parameter hasn't arrived yet, so we degrade to an average sized player. */
const FALLBACK_EYE_HEIGHT_METERS = 1.6;

@Service()
export default class Bridge {
    private fftValue = 0;
    private lastFftReceived = 0;
    private gameDevices = new Map<string,GameDevice>();
    private outputs = new Set<BridgeOutput>();

    constructor(
        private osc: OscConnection,
        private intiface: Intiface,
        private configService: ConfigService
    ) {
        this.osc.on('add', this.onOscAddKey);
        this.osc.on('clear', this.onOscClear);
        this.intiface.on('addFeature', f => {
            this.outputs.add(new BridgeOutput(f,this.configService,this.osc));
        });
        this.intiface.on('removeFeature', f => {
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

interface LinkOutput {
    output: number;
    backward: boolean;
}

function getAbsoluteDepthMutator(mutators: OutputLinkMutator[]) {
    return mutators.find(
        (mutator): mutator is OutputLinkAbsoluteDepthMutator => mutator.kind === 'absoluteDepth',
    );
}

/**
 * Converts a "fraction of the penetrator inserted" level into "inserted depth relative to the
 * depth which should give full intensity". This is what makes a long penetrator feel the same
 * as a short one: without it, the level is a fraction of the penetrator's own length, so larger
 * penetrators need proportionally more movement to reach the same intensity.
 *
 * Applying this before the other mutators also means the motion-based mutator measures real
 * speed (as a fraction of eye height per second) rather than speed as a fraction of the
 * penetrator's length.
 *
 * eyeHeightMeters is how big the player currently is, and the depth which gives full intensity is
 * a fraction of it. So the same depth counts for more with a small player and for less with a
 * giant, and a player who changes size keeps the same feel.
 */
function toAbsoluteDepth(
    level: number,
    lengthMeters: number | undefined,
    mutator: OutputLinkAbsoluteDepthMutator,
    eyeHeightMeters: number,
): number {
    const length = lengthMeters ?? mutator.assumedLengthMeters;
    const fullPowerDepth = mutator.fullPowerDepthFraction * eyeHeightMeters;
    if (!(length > 0) || !(fullPowerDepth > 0)) return level;
    return level * length / fullPowerDepth;
}

/**
 * The player's current eye height in meters, which is what the depth threshold is relative to.
 * Falls back to an average player if the parameter hasn't arrived from VRChat yet.
 */
function getEyeHeight(entries: Map<string, OscValue>): number {
    const value = entries.get(EYE_HEIGHT_PARAMETER)?.get();
    if (typeof value != 'number' || !(value > 0)) return FALLBACK_EYE_HEIGHT_METERS;
    return value;
}

export class BridgeOutput {
    private lastLinkValues: number[] = [];
    private lastSourceValues = new Map<string, number>();
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

    private applyMutators(
        value: number,
        velocity: number,
        mutators: OutputLinkMutator[],
    ): LinkOutput {
        // Note: 'absoluteDepth' is deliberately not handled here. It converts the source value
        // itself (see getLinkOutputs), before the velocity used below is measured.
        let backward = false;
        if (this.bioFeature.type !== 'linear' && mutators.some(mutator => mutator.kind === 'motionBased')) {
            value = Math.abs(velocity) / 5;
            backward = velocity < 0;
        }

        const deadZone = mutators.find(
            (mutator): mutator is Extract<OutputLinkMutator, {kind: 'deadZone'}> => mutator.kind === 'deadZone',
        );
        if (deadZone) {
            if (deadZone.level >= 1) {
                value = 0;
            } else if (deadZone.level > 0) {
                value = (value - deadZone.level) / (1 - deadZone.level);
            }
        }
        const scale = mutators.find(
            (mutator): mutator is Extract<OutputLinkMutator, {kind: 'scale'}> => mutator.kind === 'scale',
        );
        if (scale) value = value * scale.scale;
        return {output: value, backward};
    }

    getLinkOutputs(gameDevices: GameDevice[], audioLevel: number | undefined, config: Output, timeDelta: number): LinkOutput[] {
        const links = config.links;
        const entries = this.osc.entries();
        const nextLastSources = new Map<string, number>();
        const applyMutators = (sourceId: string, value: number, mutators: OutputLinkMutator[]) => {
            const lastValue = this.lastSourceValues.get(sourceId) ?? value;
            nextLastSources.set(sourceId, value);
            const velocity = timeDelta === 0 ? 0 : (value - lastValue) / timeDelta * 1000;
            return this.applyMutators(value, velocity, mutators);
        };

        const linkOutputs = links.map((link, linkIndex) => {
            const linkId = String(linkIndex);
            if (link.kind === 'constant') {
                if (this.bioFeature.type === 'linear') return {output: 0, backward: false};
                return {
                    output: link.level,
                    backward: false,
                };
            }
            if (link.kind === 'systemAudio') {
                if (this.bioFeature.type === 'linear') return {output: 0, backward: false};
                const rawAudio = audioLevel ?? 0;
                return applyMutators(linkId, rawAudio, link.mutators);
            }
            if (link.kind === 'vrchat.avatarParameter') {
                const parameter = link.parameter.trim();
                if (!parameter) return {output: 0, backward: false};
                const valueUnknown = entries.get(parameter)?.get();
                const raw =
                    typeof valueUnknown === 'number'
                        ? valueUnknown
                        : typeof valueUnknown === 'boolean'
                            ? (valueUnknown ? 1 : 0)
                            : 0;
                return applyMutators(`${linkId}/${parameter}`, raw, link.mutators);
            }
            let best: LinkOutput = {output: 0, backward: false};
            if (link.kind === 'vrchat.sps.plug' || link.kind === 'vrchat.sps.socket' || link.kind === 'vrchat.sps.touch') {
                const absoluteDepth = getAbsoluteDepthMutator(link.mutators);
                const eyeHeight = absoluteDepth ? getEyeHeight(entries) : 1;
                for (const gameDevice of gameDevices) {
                    for (const source of gameDevice.getSources(link)) {
                        const level = absoluteDepth && source.penetration
                            ? toAbsoluteDepth(source.level, source.penetration.lengthMeters, absoluteDepth, eyeHeight)
                            : source.level;
                        const candidate = applyMutators(`${linkId}/${source.id}`, level, link.mutators);
                        if (candidate.output > best.output) {
                            best = candidate;
                        }
                    }
                }
            }
            return best;
        });
        this.lastSourceValues = nextLastSources;
        this.lastLinkValues = linkOutputs.map(linkOutput => linkOutput.output);
        return linkOutputs;
    }

    pushToBio(gameDevices: GameDevice[], audioLevel: number | undefined) {
        const now = Date.now();
        const timeDeltaReal = now - this.lastPushTime;
        const config = this.getConfig();
        const timeDelta = clamp(timeDeltaReal, 0, 250); // safety limited

        const linkOutputs = this.getLinkOutputs(gameDevices, audioLevel, config, timeDelta);
        let level = 0;
        let motionBasedBackward = false;
        for (const linkOutput of linkOutputs) {
            if (linkOutput.output > level) {
                level = linkOutput.output;
                motionBasedBackward = linkOutput.backward;
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
        this.lastPushTime = now;
    }

    remap(num: number, fromMin: number, fromMax: number, toMin: number, toMax: number) {
        const normalized = (num - fromMin) / (fromMax-fromMin);
        return normalized * (toMax-toMin) + toMin;
    }

    getCurrentLevel() {
        return this.lastLevel;
    }

    getLastLinkValues() {
        return [...this.lastLinkValues];
    }
}
