import type Buttplug from "./Buttplug";
import type OscConnection from "./OscConnection";
import type {OscValue} from "./OscConnection";

export default class Bridge {
    private readonly logger;
    private readonly configMap;
    private readonly osc;
    private readonly buttConnection;
    private lastPushTime = 0;
    private fftValue = 0;
    private lastFftReceived = 0;

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

        setInterval(() => {
            this.pushToBio();
        }, 1000/15);
    }

    pushToBio() {
        const now = Date.now();
        const timeSinceLastPush = now - this.lastPushTime;
        this.lastPushTime = now;
        const audioLevel = parseFloat(this.configMap.get('audio') ?? '');

        let maxLevel = 0;
        for (const device of this.buttConnection.getDevices()) {
            const getParam = (subkey: string) => {
                return this.configMap.get(device.id+'.'+subkey) || this.configMap.get('all.'+subkey);
            }
            const getBool = (subkey: string, def = false) => {
                const p = getParam(subkey);
                if (p === undefined) return def;
                return p === '1' || p === 'true';
            }

            const bindType = getParam('type') || 'all';
            const bindId = getParam('id');
            const bind = getParam('key');
            const idle = parseFloat(getParam('idle') || '0');
            const scale = parseFloat(getParam('scale') || '1');
            const forceLinearPref = getBool('linear', true);

            var hasOGBParams = false;
            for (const [k,v] of this.osc.entries()) {
                if (k.startsWith('OGB/')) {
                    hasOGBParams = true;
                }
            }
            const gameDevices = new Map<string,GameDevice>();
            for (const [k,v] of this.osc.entries()) {
                const split = k.split('/');
                if ((hasOGBParams && split[0] === 'OGB') || (!hasOGBParams && split[0] === 'TPS_Internal')) {
                    const type = split[1];
                    const id = split[2];
                    const contactType = split[3];
                    if (!type || !id || !contactType) continue;
                    const key = type + '__' + id;
                    let gameDevice = gameDevices.get(key);
                    if (!gameDevice) {
                        gameDevice = new GameDevice(type, id);
                        gameDevices.set(key, gameDevice);
                    }
                    gameDevice.set(contactType, v);
                }
            }

            let level = 0;
            const contributeLevel = (d: number) => {
                level = Math.max(level, d);
            }
            const contributeValue = (v: OscValue | undefined) => {
                if (!v) return;
                if (device.linear || forceLinearPref) {
                    const value = v.get();
                    if (typeof value == 'number') contributeLevel(value);
                    return;
                }
                const delta = v.getDelta();
                const diffPerSecond = delta / timeSinceLastPush * 1000;
                contributeLevel(diffPerSecond / 5);
            }
            if (bind) {
                const entries = this.osc.entries();
                for (let k of bind.split(',')) {
                    const value = entries.get(k.trim());
                    if (value) contributeValue(value);
                }
            }

            const bindPen = bindType === 'pen' || bindType === 'all';
            const bindOrf = bindType === 'orf' || bindType === 'all';
            for (const d of gameDevices.values()) {
                if (d.type === 'Pen') { if(!bindPen) continue; }
                else if (d.type === 'Orf') { if(!bindOrf) continue; }
                else continue;
                if (bindId && d.id !== bindId) continue;

                if (hasOGBParams) {
                    if (d.type === 'Orf') {
                        if (getBool('touchSelf', false) && d.getBool('TouchSelfClose')) contributeValue(d.get('TouchSelf'));
                        if (getBool('touchOthers', true) && d.getBool('TouchOthersClose')) contributeValue(d.get('TouchOthers'));
                        if (getBool('penSelf', false)) contributeValue(d.get('PenSelf'));
                        if (getBool('penOthers', true)) contributeValue(d.get('PenOthers'));
                        if (getBool('frotOthers', true)) contributeValue(d.get('FrotOthers'));
                    }
                    if (d.type === 'Pen') {
                        if (getBool('touchSelf', false) && d.getBool('TouchSelfClose')) contributeValue(d.get('TouchSelf'));
                        if (getBool('touchOthers', true) && d.getBool('TouchOthersClose')) contributeValue(d.get('TouchOthers'));
                        if (getBool('penSelf', false)) contributeValue(d.get('PenSelf'));
                        if (getBool('penOthers', true)) contributeValue(d.get('PenOthers'));
                        if (getBool('frotOthers', true) && d.getBool('FrotOthersClose')) contributeValue(d.get('FrotOthers'));
                    }
                } else {
                    if (d.type === 'Orf') {
                        if (getBool('penOthers', true)) contributeValue(d.get('Depth_In'));
                    }
                    if (d.type === 'Pen') {
                        if (getBool('penOthers', true)) contributeValue(d.get('RootRoot'));
                    }
                }
            }

            if (!isNaN(audioLevel) && audioLevel != 0 && !device.linear && this.lastFftReceived > Date.now() - 1000) {
                contributeLevel(audioLevel * this.fftValue);
            }

            if (scale !== undefined) {
                level = level * scale;
            }
            if (!device.linear && idle) {
                level = level * (1-idle) + idle;
            }

            // Safety
            if (level < 0) level = 0;
            if (level > 1) level = 1;
            if (isNaN(level)) level = 0;
            if (level < 0.05) level = 0;

            maxLevel = Math.max(maxLevel, level);
            if (level === 0 && device.linear) continue;
            device.setLevel(level);
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

// This is just here so don't accidentally typo one of the OGB standard contact key names
type allowedGetValues =
    'TouchSelf'
    | 'TouchOthers'
    | 'PenSelf'
    | 'PenOthers'
    | 'FrotOthers'
    | 'Depth_In'
    | 'RootRoot'
    ;
type allowedGetBools =
    'TouchSelfClose'
    | 'TouchOthersClose'
    | 'FrotOthersClose'
    ;

class GameDevice {
    readonly type; // probably 'Orf' or 'Pen'
    readonly id;
    private readonly  _values = new Map<string,OscValue>();

    constructor(type: string, id: string) {
        this.type = type;
        this.id = id;
    }

    set(key: string, value: OscValue) {
        this._values.set(key, value);
    }
    get(key: allowedGetValues) {
        return this._values.get(key);
    }
    getBool(key: allowedGetBools): boolean {
        const val = this._values.get(key);
        if (!val) return false;
        return !!val.get();
    }
}
