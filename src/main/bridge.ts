import type Buttplug from "./Buttplug";
import type {OscValue} from "./OscConnection";
import type OscConnection from "./OscConnection";
import {GameDevice} from "./GameDevice";
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
            let hasOGBDevice = false;
            for (const gameDevice of this.gameDevices.values()) {
                if (!gameDevice.isTps) {
                    hasOGBDevice = true;
                    break;
                }
            }
            for (const gameDevice of this.gameDevices.values()) {
                if (hasOGBDevice && gameDevice.isTps) continue;
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
        return this.gameDevices.values();
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
    maxAcceleration = 1; // unit per second^2

    constructor(bioFeature: DeviceFeature, configMap: Map<string,string>, osc: OscConnection) {
        this.bioFeature = bioFeature;
        this.configMap = configMap;
        this.osc = osc;
        console.log("New b.io feature loaded into BridgeToy: " + this.bioFeature.id);
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
            if (this.bioFeature.linear && source.deviceType == 'audio') continue;
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
        const timeSinceLastPush = now - this.lastPushTime;
        const idle = this.getConfigNumber('idle', 0);
        const scale = this.getConfigNumber('scale', 1);
        const motionBased = !this.getConfigBool('linear', true);

        const sources = this.getRelevantSources(globalSources);
        let level = 0;
        for (const source of sources) {
            const value = source.value;
            if (this.bioFeature.linear) {
                level = Math.max(level, value);
            } else if (motionBased) {
                const lastSource = this.lastSources.get(source.getUniqueKey());
                const lastValue = lastSource?.value;
                if (lastValue !== undefined) {
                    const delta = Math.abs(value - lastValue);
                    const diffPerSecond = delta / timeSinceLastPush * 1000;
                    level = Math.max(level, diffPerSecond / 5);
                }
            } else {
                level = Math.max(level, value);
            }
        }

        if (scale !== undefined) {
            level = level * scale;
        }
        if (idle) {
            level = level * (1-idle) + idle;
        }

        // Safety
        if (level < 0) level = 0;
        if (level > 1) level = 1;
        if (isNaN(level)) level = 0;
        //if (level < 0.05) level = 0;

        if (this.bioFeature.linear) {
            // TODO: Make this work
            /*
            const targetPosition = level;
            const currentPosition = this.bioFeature.lastLevel;
            const timeRequiredToStopSmoothly = Math.abs(this.linearVelocity) / this.maxAcceleration; // seconds
            const absDistanceRequiredToStopSmoothly = Math.abs(this.linearVelocity / 2) * timeRequiredToStopSmoothly; // units (+/-)
            const absDistanceToEdge = this.linearVelocity > 0 ? (1-currentPosition) : currentPosition;

            let stopNow = false;
            if ()

            this.linearTarget = level;
             */
        } else {
            this.bioFeature.setLevel(level);
        }

        this.lastLevel = this.bioFeature.lastLevel;
        this.lastSources.clear();
        for (const source of sources) {
            this.lastSources.set(source.getUniqueKey(), source);
        }
        this.lastPushTime = now;
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
