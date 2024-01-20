import {OscValue} from "./OscConnection";
import {BridgeSource} from "./bridge";
import {GameDeviceLengthDetector} from "./utils/GameDeviceLengthDetector";

// These are just here so don't accidentally typo one of the OGB standard contact key names

export const VrchatTag = "vrchat";
export const PenTag = "plug";
export const OrfTag = "socket";
export const TouchTag = "touch";

type allowedGetValues =
    'TouchSelf'
    | 'TouchOthers'
    | 'PenSelf'
    | 'PenOthers'
    | 'FrotOthers'
    | 'Depth_In'
    | 'RootRoot'
    | 'PenSelfNewRoot'
    | 'PenSelfNewTip'
    | 'PenOthersNewRoot'
    | 'PenOthersNewTip'
    | 'PenOthersClose'
    | 'Self'
    | 'Others'
    ;
type allowedGetBools =
    'TouchSelfClose'
    | 'TouchOthersClose'
    | 'FrotOthersClose'
    | 'PenOthersClose'
    ;

export default class GameDevice {
    private readonly _values = new Map<string, OscValue>();
    private recordedSelfLength = new GameDeviceLengthDetector();
    private recordedOthersLength = new GameDeviceLengthDetector();

    constructor(
        private readonly type: 'Orf'|'Pen'|'Touch',
        private readonly id: string,
        public readonly isTps: boolean
    ) {
    }

    addKey(key: string, value: OscValue) {
        this._values.set(key, value);
        value.on('change', () => this.onKeyChange(key));
    }

    onKeyChange(key: string) {
        if (key == 'PenSelfNewRoot' || key == 'PenSelfNewTip') {
            this.recordedSelfLength.update(
                this.get('PenSelfNewRoot'),
                this.get('PenSelfNewTip')
            );
        }
        if (key == 'PenOthersNewRoot' || key == 'PenOthersNewTip') {
            this.recordedOthersLength.update(
                this.get('PenOthersNewRoot'),
                this.get('PenOthersNewTip')
            );
        }
    }

    getNewPenAmount(self: boolean) {
        const rootProx = this.get(self ? 'PenSelfNewRoot' : 'PenOthersNewRoot')?.get();
        const tipProx = this.get(self ? 'PenSelfNewTip' : 'PenOthersNewTip')?.get();
        if (typeof rootProx == 'number' && typeof tipProx == 'number' && (rootProx > 0 || tipProx > 0)) {
            // Someone with new penetration is nearby, so never use legacy pen
            const len = (self ? this.recordedSelfLength : this.recordedOthersLength).getLength();
            if (len && tipProx > 0.99) {
                const exposedLength = 1 - rootProx;
                const exposedRatio = exposedLength / len;
                return 1 - exposedRatio;
            }
            return 0;
        }

        return undefined;
    }

    get(key: allowedGetValues) {
        return this._values.get(key);
    }

    getBool(key: allowedGetBools): boolean {
        const val = this._values.get(key);
        if (!val) return false;
        return !!val.get();
    }

    getNumber(key: allowedGetValues): number | undefined {
        const val = this.get(key)?.get();
        if (typeof val == 'number') return val;
        return undefined;
    }

    getSources(): BridgeSource[] {
        const sources: BridgeSource[] = [];
        if (!this.isTps) {
            if (this.type === 'Orf') {
                sources.push(new BridgeSource([VrchatTag, OrfTag, this.id, 'touchSelf'],
                    this.getBool('TouchSelfClose') ? this.getNumber('TouchSelf') ?? 0 : 0));
                sources.push(new BridgeSource([VrchatTag, OrfTag, this.id, 'touchOthers'],
                    this.getBool('TouchOthersClose') ? this.getNumber('TouchOthers') ?? 0 : 0));

                const penSelfLegacy = this.getNumber('PenSelf');
                const penSelfNew = this.getNewPenAmount(true);
                sources.push(new BridgeSource([VrchatTag, OrfTag, this.id, 'penSelfLegacy'],
                    penSelfLegacy ?? 0));
                sources.push(new BridgeSource([VrchatTag, OrfTag, this.id, 'penSelfNew'],
                    penSelfNew ?? 0));
                sources.push(new BridgeSource([VrchatTag, OrfTag, this.id, 'penSelf'],
                    penSelfNew ?? penSelfLegacy ?? 0));

                const penOthersLegacyClose = this.getBool('PenOthersClose') || this.get('PenOthersClose') == undefined;
                const penOthersLegacy = penOthersLegacyClose ? this.getNumber('PenOthers') : undefined;
                const penOthersNew = this.getNewPenAmount(false);
                sources.push(new BridgeSource([VrchatTag, OrfTag, this.id, 'penOthersLegacy'],
                    penOthersLegacy ?? 0));
                sources.push(new BridgeSource([VrchatTag, OrfTag, this.id, 'penOthersNew'],
                    penOthersNew ?? 0));
                sources.push(new BridgeSource([VrchatTag, OrfTag, this.id, 'penOthers'],
                    penOthersNew ?? penOthersLegacy ?? 0));

                sources.push(new BridgeSource([VrchatTag, OrfTag, this.id, 'frotOthers'],
                    this.getNumber('FrotOthers') ?? 0));
            }
            if (this.type === 'Pen') {
                sources.push(new BridgeSource([VrchatTag, PenTag, this.id, 'touchSelf'],
                    this.getBool('TouchSelfClose') ? this.getNumber('TouchSelf') ?? 0 : 0));
                sources.push(new BridgeSource([VrchatTag, PenTag, this.id, 'touchOthers'],
                    this.getBool('TouchOthersClose') ? this.getNumber('TouchOthers') ?? 0 : 0));
                sources.push(new BridgeSource([VrchatTag, PenTag, this.id, 'penSelf'],
                    this.getNumber('PenSelf') ?? 0));
                sources.push(new BridgeSource([VrchatTag, PenTag, this.id, 'penOthers'],
                    this.getNumber('PenOthers') ?? 0));
                sources.push(new BridgeSource([VrchatTag, PenTag, this.id, 'frotOthers'],
                    this.getBool('FrotOthersClose') ? this.getNumber('FrotOthers') ?? 0 : 0));
            }
            if (this.type === 'Touch') {
                sources.push(new BridgeSource([VrchatTag, TouchTag, this.id, 'touchSelf'],
                    this.getNumber('Self') ?? 0));
                sources.push(new BridgeSource([VrchatTag, TouchTag, this.id, 'touchOthers'],
                    this.getNumber('Others') ?? 0));
            }
        } else {
            if (this.type === 'Orf') {
                sources.push(new BridgeSource([VrchatTag, OrfTag, this.id, 'penOthers'],
                    this.getNumber('Depth_In') ?? 0));
            }
            if (this.type === 'Pen') {
                sources.push(new BridgeSource([VrchatTag, PenTag, this.id, 'penOthers'],
                    this.getNumber('RootRoot') ?? 0));
            }
        }
        return sources;
    }
}
