import Buttplug from "./Buttplug";
import {OscValue} from "./OscConnection";
import OscConnection from "./OscConnection";
import GameDevice from "./GameDevice";
import {DeviceFeature} from "./Buttplug";
import LoggerService, {SubLogger} from "./services/LoggerService";
import {Config} from "../common/configTypes";
import OgbMath from "./utils/OgbMath";
import OgbConfigService from "./services/OgbConfigService";
import {Service} from "typedi";
import TagMatcher from "../common/TagMatcher";

@Service()
export default class Bridge {
    private logger: SubLogger;
    private fftValue = 0;
    private lastFftReceived = 0;
    private gameDevices = new Map<string,GameDevice>();
    private toys = new Set<BridgeToy>();

    constructor(
        private readonly osc: OscConnection,
        private readonly buttConnection: Buttplug,
        logger: LoggerService,
        private readonly config: OgbConfigService
    ) {
        this.logger = logger.get('Bridge');
        this.osc.on('add', this.onOscAddKey);
        this.osc.on('clear', this.onOscClear);
        this.buttConnection.on('addFeature', f => {
            this.toys.add(new BridgeToy(f,config,this.osc));
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
            if (type != 'Orf' && type != 'Pen') return;
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
            if (type != 'Touch') return;
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

    getSources() {
        const sources: BridgeSource[] = [];

        const allGameDevices = Array.from(this.gameDevices.values());
        const hasOGBDevice = allGameDevices.some(device => !device.isTps);
        const gameDevicesToUse = Array.from(this.gameDevices.values())
            .filter(device => !hasOGBDevice || !device.isTps);
        sources.push(...gameDevicesToUse.flatMap(d => d.getSources()));

        if (this.config.get().plugins.audio.enabled && this.lastFftReceived > Date.now() - 1000) {
            sources.push(new BridgeSource(['audio'], this.fftValue));
        }

        return sources;
    }

    getToys() {
        return this.toys;
    }

    pushToBio() {
        let maxLevel = 0;

        const globalSources = this.getSources();
        for (const toy of this.toys) {
           toy.pushToBio(globalSources);
           maxLevel = Math.max(maxLevel, toy.lastLevel);
        }

        const sendParam = this.config.get().plugins.vrchat.maxLevelParam;
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
    constructor(
        public readonly tags: string[],
        public readonly value: number
    ) {
    }

    getUniqueKey() {
        return this.tags.join("|");
    }
}

class BridgeToy {
    private lastSources: Map<string,BridgeSource> = new Map();
    tags: string[] = [];
    lastLevel = 0;
    lastPushTime = 0;

    constructor(
        public readonly bioFeature: DeviceFeature,
        private readonly config: OgbConfigService,
        private readonly osc: OscConnection
    ) {
        this.tags.push(bioFeature.id);
        //console.log("New b.io feature loaded into BridgeToy: " + this.bioFeature.id);
    }

    getLevelFromSource(source: BridgeSource, timeDelta: number): [number,boolean] {
        let scale = 1;
        let motionBased = false;

        for (const rule of this.config.get().rules) {
            const matcher = new TagMatcher(rule.condition);
            const ruleApplies = matcher.matches(this.tags);
            if (ruleApplies) {
                if (rule.action.type == "scale") {
                    scale *= rule.action.scale;
                } else if (rule.action.type == "movement") {
                    motionBased = true;
                }
            }
        }

        let backward = false;
        let value = source.value;

        if (this.bioFeature.type != 'linear' && motionBased) {
            const lastSource = this.lastSources.get(source.getUniqueKey());
            const lastValue = lastSource?.value;
            if (lastValue !== undefined) {
                const delta = Math.abs(value - lastValue);
                const diffPerSecond = delta / timeDelta * 1000;
                value = diffPerSecond / 5;
                backward = delta < 0;
            }
        }

        value *= scale;

        return [value,backward];
    }

    pushToBio(sources: BridgeSource[]) {
        const now = Date.now();
        const timeDelta = Math.min(now - this.lastPushTime, 100); // safety limited

        let level = 0;
        let motionBasedBackward = false;

        for (const source of sources) {
            const [sourceLevel, sourceBackward] = this.getLevelFromSource(source, timeDelta);
            if (sourceLevel > level) {
                level = sourceLevel;
                motionBasedBackward = sourceBackward;
            }
        }

        level = OgbMath.clamp(level, 0, 1);

        this.bioFeature.setLevel(level, motionBasedBackward, now, timeDelta);

        this.lastLevel = this.bioFeature.lastLevel;
        this.lastSources.clear();
        for (const source of sources) {
            this.lastSources.set(source.getUniqueKey(), source);
        }
        this.lastPushTime = now;
    }

    getStatus() {
        const lines = [];
        lines.push(`${this.bioFeature.id} = ${Math.round(this.lastLevel*100)}%`);

        const sourceLines = [];
        for (const source of this.lastSources.values()) {
            //if (source.value == 0) continue;
            sourceLines.push(`  ${source.tags.join(",")} = ${Math.round(source.value*100)}%`);
        }
        sourceLines.sort();
        lines.push(...sourceLines);
        return lines.join('\n');
    }
}
