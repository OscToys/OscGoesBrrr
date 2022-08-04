import type {OscValue} from "./OscConnection";
import {BridgeSource} from "./bridge";

// These are just here so don't accidentally typo one of the OGB standard contact key names

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
    ;
type allowedGetBools =
    'TouchSelfClose'
    | 'TouchOthersClose'
    | 'FrotOthersClose'
    ;

export class GameDevice {
    readonly type; // probably 'Orf' or 'Pen'
    readonly id;
    readonly isTps;
    private readonly _values = new Map<string, OscValue>();
    recordedSelfLength: number|undefined = undefined;
    recordedOthersLength: number|undefined = undefined;

    constructor(type: string, id: string, isTps: boolean) {
        this.type = type;
        this.id = id;
        this.isTps = isTps;
    }

    addKey(key: string, value: OscValue) {
        this._values.set(key, value);
        value.on('change', () => this.onKeyChange(key));
    }

    onKeyChange(key: string) {
        if (key == 'PenSelfNewRoot' || key == 'PenSelfNewTip') {
            this.updateLengthFromProximity(
                this.get('PenSelfNewRoot'),
                this.get('PenSelfNewTip'),
                this.recordedSelfLength,
                (len: number|undefined) => this.recordedSelfLength = len
            );
        }
        if (key == 'PenOthersNewRoot' || key == 'PenOthersNewTip') {
            this.updateLengthFromProximity(
                this.get('PenOthersNewRoot'),
                this.get('PenOthersNewTip'),
                this.recordedOthersLength,
                (len: number|undefined) => this.recordedOthersLength = len
            );
        }
    }

    updateLengthFromProximity(
        rootProxVal: OscValue|undefined,
        tipProxVal: OscValue|undefined,
        oldValue: number|undefined,
        update: (length:number|undefined) => void
    ) {
        const rootProx = rootProxVal?.get();
        const tipProx = tipProxVal?.get();
        if (typeof rootProx != 'number' || typeof tipProx != 'number') {
            // Missing data
            update(undefined);
            return;
        }
        if (rootProx < 0.01 || tipProx < 0.01) {
            // Nobody in radius, clear recorded length
            update(undefined);
            return;
        }
        if (rootProx > 0.99) {
            // This should be nearly impossible (their root collider is in the center of our orifice)
            // Just keep using whatever we recorded before
            return;
        }

        // The receiver spheres are 1m in size, so this is in meters
        const length = tipProx - rootProx;
        if (length < 0.02) {
            // Too short (broken or backward?)
            // Just keep using whatever we recorded before
            return;
        }
        if (tipProx > 0.99) {
            // Penetrator is penetrating right now.
            // Store the length as a guess only if we haven't already recorded it or it's longer
            if (oldValue == undefined || length > oldValue) update(length);
        } else {
            // Good to go
            update(length);
        }
    }

    getNewPenAmount(self: boolean) {
        const len = self ? this.recordedSelfLength : this.recordedOthersLength;
        if (len) {
            const rootProx = this.get(self ? 'PenSelfNewRoot' : 'PenOthersNewRoot')?.get();
            const tipProx = this.get(self ? 'PenSelfNewTip' : 'PenOthersNewTip')?.get();
            if (typeof rootProx == 'number' && typeof tipProx == 'number') {
                if (tipProx > 0.99) {
                    const exposedLength = 1 - rootProx;
                    const exposedRatio = exposedLength / len;
                    return 1 - exposedRatio;
                } else {
                    return 0;
                }
            }
        }
        return undefined;
    }

    getLegacyPenAmount(self: boolean): number | undefined {
        return this.getNumber(self ? 'PenSelf' : 'PenOthers');
    }

    getPenAmount(self: boolean) {
        return this.getNewPenAmount(self) ?? this.getLegacyPenAmount(self);
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
                sources.push(new BridgeSource('orf', this.id, 'touchSelf',
                    this.getBool('TouchSelfClose') ? this.getNumber('TouchSelf') ?? 0 : 0));
                sources.push(new BridgeSource('orf', this.id, 'touchOthers',
                    this.getBool('TouchOthersClose') ? this.getNumber('TouchOthers') ?? 0 : 0));
                sources.push(new BridgeSource('orf', this.id, 'penSelfLegacy',
                    this.getLegacyPenAmount(true) ?? 0));
                sources.push(new BridgeSource('orf', this.id, 'penSelfNew',
                    this.getNewPenAmount(true) ?? 0));
                sources.push(new BridgeSource('orf', this.id, 'penSelf',
                    this.getPenAmount(true) ?? 0));
                sources.push(new BridgeSource('orf', this.id, 'penOthersLegacy',
                    this.getLegacyPenAmount(false) ?? 0));
                sources.push(new BridgeSource('orf', this.id, 'penOthersNew',
                    this.getNewPenAmount(false) ?? 0));
                sources.push(new BridgeSource('orf', this.id, 'penOthers',
                    this.getPenAmount(false) ?? 0));
                sources.push(new BridgeSource('orf', this.id, 'frotOthers',
                    this.getNumber('FrotOthers') ?? 0));
            }
            if (this.type === 'Pen') {
                sources.push(new BridgeSource('pen', this.id, 'touchSelf',
                    this.getBool('TouchSelfClose') ? this.getNumber('TouchSelf') ?? 0 : 0));
                sources.push(new BridgeSource('pen', this.id, 'touchOthers',
                    this.getBool('TouchOthersClose') ? this.getNumber('TouchOthers') ?? 0 : 0));
                sources.push(new BridgeSource('pen', this.id, 'penSelf',
                    this.getLegacyPenAmount(true) ?? 0));
                sources.push(new BridgeSource('pen', this.id, 'penOthers',
                    this.getLegacyPenAmount(false) ?? 0));
                sources.push(new BridgeSource('pen', this.id, 'frotOthers',
                    this.getBool('FrotOthersClose') ? this.getNumber('FrotOthers') ?? 0 : 0));
            }
        } else {
            if (this.type === 'Orf') {
                sources.push(new BridgeSource('orf', this.id, 'penOthers',
                    this.getNumber('Depth_In') ?? 0));
            }
            if (this.type === 'Pen') {
                sources.push(new BridgeSource('pen', this.id, 'penOthers',
                    this.getNumber('RootRoot') ?? 0));
            }
        }
        return sources;
    }

    getStatus() {
        const out = [];
        out.push(`${this.type}:${this.id}`);
        if (this.recordedSelfLength) out.push(`  Nearby self-penetrator length: ${this.recordedSelfLength.toFixed(2)}m`);
        if (this.recordedOthersLength) out.push(`  Nearby penetrator length: ${this.recordedOthersLength.toFixed(2)}m`);
        for (const source of this.getSources()) {
            out.push(`  ${source.featureName}=${Math.round(source.value*100)}%`);
        }
        return out.join('\n');
    }
}
