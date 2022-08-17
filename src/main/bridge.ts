import type Buttplug from "./Buttplug";
import type {OscValue} from "./OscConnection";
import type OscConnection from "./OscConnection";
import GameDevice from "./GameDevice";
import type {DeviceFeature} from "./Buttplug";

export default class Bridge {
    private readonly logger;
    private readonly configMap;
    private readonly osc;
    private readonly buttConnection;
    private fftValue = 0;
    private lastFftReceived = 0;
    private gameDevices = new Map<string,GameDevice>();
    private toys = new Set<BridgeToy>();

    constructor(
        oscConnection: OscConnection,
        buttConnection: Buttplug,
        logger: (...args: unknown[]) => void,
        configMap: Map<string,string>
    ) {
        this.osc = oscConnection;
        this.buttConnection = buttConnection;
        this.logger = logger;
        this.configMap = configMap;

        this.osc.on('add', this.onOscAddKey);
        this.osc.on('clear', this.onOscClear);
        this.buttConnection.on('addFeature', f => {
            this.toys.add(new BridgeToy(f,this.configMap,this.osc));
        });
        this.buttConnection.on('removeFeature', f => {
            for (const toy of this.toys) {
                if (toy.bioFeature == f) this.toys.delete(toy);
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
    }

    onOscClear = () => {
        this.gameDevices.clear();
    }

    getGlobalSources(includeGameDevices = true) {
        const sources: BridgeSource[] = [];

        if (includeGameDevices) {
            for (const gameDevice of this.getGameDevices()) {
                sources.push(...gameDevice.getSources());
            }
        }

        const audioLevel = parseFloat(this.configMap.get('audio') ?? '');
        if (!isNaN(audioLevel) && audioLevel != 0 && this.lastFftReceived > Date.now() - 1000) {
            sources.push(new BridgeSource('audio', 'audio', 'audio', audioLevel * this.fftValue));
        }

        return sources;
    }

    getGameDevices() {
        const allGameDevices = Array.from(this.gameDevices.values());
        const hasOGBDevice = allGameDevices.some(device => !device.isTps);
        return Array.from(this.gameDevices.values())
            .filter(device => !hasOGBDevice || !device.isTps);
    }

    getToys() {
        return this.toys;
    }

    pushToBio() {
        let maxLevel = 0;

        const globalSources = this.getGlobalSources();
        for (const toy of this.toys) {
           toy.pushToBio(globalSources);
           maxLevel = Math.max(maxLevel, toy.lastLevel);
        }

        this.osc.clearDeltas();
        const sendParam = this.configMap.get('maxLevelParam');
        if (sendParam) {
            this.osc.send(sendParam, maxLevel);
        }
    }

    receivedFft(level: number) {
        this.fftValue = level;
        this.lastFftReceived = Date.now();
    }
}

export class BridgeSource {
    deviceType;
    deviceName;
    featureName;
    value;

    constructor(
        deviceType: "orf" | "pen" | "audio" | "raw",
        deviceName: string,
        featureName: string,
        value: number
    ) {
        this.deviceType = deviceType;
        this.deviceName = deviceName;
        this.featureName = featureName;
        this.value = value;
    }

    getUniqueKey() {
        return this.deviceType+"__"+this.deviceName+"__"+this.featureName;
    }
}

class BridgeToy {
    readonly bioFeature;
    private readonly configMap;
    private readonly osc;
    private lastSources: Map<string,BridgeSource> = new Map();
    lastLevel = 0;
    lastPushTime = 0;
    linearTarget = 0;
    linearVelocity = 0;
    lastLinearSuck = 0;

    constructor(bioFeature: DeviceFeature, configMap: Map<string,string>, osc: OscConnection) {
        this.bioFeature = bioFeature;
        this.configMap = configMap;
        this.osc = osc;
        //console.log("New b.io feature loaded into BridgeToy: " + this.bioFeature.id);
    }

    getRelevantSources(globalSources: BridgeSource[]) {
        const bindType = this.getConfigParam('type') ?? 'all';
        const bindId = this.getConfigParam('id');
        const bind = this.getConfigParam('key');
        const bindPen = bindType === 'pen' || bindType === 'all';
        const bindOrf = bindType === 'orf' || bindType === 'all';
        const defaultFeatures = ['touchOthers','penOthers','frotOthers'];

        const sources: BridgeSource[] = [];
        for (const source of globalSources) {
            if (this.bioFeature.type == 'linear' && source.deviceType == 'audio') continue;
            if (source.deviceType === 'pen' || source.deviceType === 'orf') {
                if (source.deviceType === 'pen' && !bindPen) continue;
                if (source.deviceType === 'orf' && !bindOrf) continue;
                if (bindId && source.deviceName !== bindId) continue;
                if (!this.getConfigBool(source.featureName, defaultFeatures.includes(source.featureName))) continue;
            }
            sources.push(source);
        }
        if (bind) {
            const entries = this.osc.entries();
            for (let k of bind.split(',')) {
                const valueUnknown = entries.get(k.trim())?.get();
                const value = (typeof valueUnknown == 'number') ? valueUnknown : 0;
                sources.push(new BridgeSource('raw', 'raw', k, value));
            }
        }
        return sources;
    }

    pushToBio(globalSources: BridgeSource[]) {
        const now = Date.now();
        const timeDelta = Math.min(now - this.lastPushTime, 100); // safety limited
        const motionBased = !this.getConfigBool('linear', true);

        const sources = this.getRelevantSources(globalSources);
        let level = 0;
        let motionBasedBackward = false;
        for (const source of sources) {
            const value = source.value;
            if (this.bioFeature.type == 'linear') {
                level = Math.max(level, value);
            } else if (motionBased) {
                const lastSource = this.lastSources.get(source.getUniqueKey());
                const lastValue = lastSource?.value;
                if (lastValue !== undefined) {
                    const delta = Math.abs(value - lastValue);
                    const diffPerSecond = delta / timeDelta * 1000;
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

        level = this.clamp(level, 0, 1);

        if (this.bioFeature.type == 'linear') {
            const timeDeltaSeconds = timeDelta / 1000;
            const oldVelocity = this.linearVelocity;
            let maxVelocity = this.getConfigNumber('maxv', 3);
            let maxAcceleration = this.getConfigNumber('maxa', 20);
            const customCalc = this.getConfigBool('customCalc', false);
            const customCalcClamp = this.getConfigBool('customCalcClamp', true);
            const durationMult = this.getConfigNumber('durationMult', 1);
            const restingPos = this.clamp(this.getConfigNumber('restingPos', 0), 0, 1);
            const restingTime = this.getConfigNumber('restingTime', 3) * 1000;

            let targetPosition = 1 - level;
            const min = this.getConfigNumber('min', 0);
            const max = this.getConfigNumber('max', 1);
            targetPosition = this.remap(targetPosition, 0, 1, min, max);

            if (level > 0) {
                this.lastLinearSuck = now;
            } else if (this.lastLinearSuck < now - restingTime) {
                targetPosition = restingPos;
                maxAcceleration = 999;
                maxVelocity = Math.min(maxVelocity, 1);
            }

            targetPosition = this.clamp(targetPosition, 0, 1);

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
                this.bioFeature.setLevel(newPosition, Math.round(timeDelta * durationMult), customCalc, customCalcClamp);
            }

            this.linearVelocity = newVelocity;
            this.linearTarget = targetPosition;

            const debug = this.getConfigBool('debugLog');
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
            const idle = this.getConfigNumber('idle', 0);
            const scale = this.getConfigNumber('scale', 1);
            if (scale !== undefined) {
                level = level * scale;
            }
            if (idle) {
                level = level * (1 - idle) + idle;
            }
            level = this.clamp(level, 0, 1);

            if (this.bioFeature.type == 'rotate') {
                this.bioFeature.setLevel(level * (motionBasedBackward ? -1 : 1));
            } else {
                this.bioFeature.setLevel(level);
            }
        }

        this.lastLevel = this.bioFeature.lastLevel;
        this.lastSources.clear();
        for (const source of sources) {
            this.lastSources.set(source.getUniqueKey(), source);
        }
        this.lastPushTime = now;
    }

    remap(num: number, fromMin: number, fromMax: number, toMin: number, toMax: number) {
        const normalized = (num - fromMin) / (fromMax-fromMin);
        return normalized * (toMax-toMin) + toMin;
    }
    clamp(num: number, min: number, max: number) {
        if (isNaN(num)) return min;
        return Math.max(min, Math.min(max, num));
    }

    getConfigParam(subkey: string) {
        return this.configMap.get(this.bioFeature.id+'.'+subkey) ?? this.configMap.get('all.'+subkey);
    }
    getConfigBool(subkey: string, def = false) {
        const p = this.getConfigParam(subkey);
        if (p === '1' || p === 'true') return true;
        if (p === '0' || p === 'false') return false;
        return def;
    }
    getConfigNumber(subkey: string, def = 0) {
        const p = this.getConfigParam(subkey);
        if (p === undefined) return def;
        const num = parseFloat(p);
        if (isNaN(num)) return def;
        return num;
    }
    getStatus() {
        const lines = [];
        lines.push(`${this.bioFeature.id} = ${Math.round(this.lastLevel*100)}%`);

        const sourceLines = [];
        for (const source of this.lastSources.values()) {
            //if (source.value == 0) continue;
            sourceLines.push(`  ${source.deviceType}.${source.deviceName}.${source.featureName} = ${Math.round(source.value*100)}%`);
        }
        sourceLines.sort();
        lines.push(...sourceLines);
        return lines.join('\n');
    }
}
