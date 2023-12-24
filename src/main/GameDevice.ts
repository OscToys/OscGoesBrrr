import {OscValue} from "./OscConnection";
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
    readonly type; // probably 'Orf' or 'Pen'
    readonly id;
    readonly isTps;
    private readonly _values = new Map<string, OscValue>();
    private recordedSelfLength = new GameDeviceLengthDetector();
    private recordedOthersLength = new GameDeviceLengthDetector();

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
                sources.push(new BridgeSource('orf', this.id, 'touchSelf',
                    this.getBool('TouchSelfClose') ? this.getNumber('TouchSelf') ?? 0 : 0));
                sources.push(new BridgeSource('orf', this.id, 'touchOthers',
                    this.getBool('TouchOthersClose') ? this.getNumber('TouchOthers') ?? 0 : 0));

                const penSelfLegacy = this.getNumber('PenSelf');
                const penSelfNew = this.getNewPenAmount(true);
                sources.push(new BridgeSource('orf', this.id, 'penSelfLegacy',
                    penSelfLegacy ?? 0));
                sources.push(new BridgeSource('orf', this.id, 'penSelfNew',
                    penSelfNew ?? 0));
                sources.push(new BridgeSource('orf', this.id, 'penSelf',
                    penSelfNew ?? penSelfLegacy ?? 0));

                const penOthersLegacyClose = this.getBool('PenOthersClose') || this.get('PenOthersClose') == undefined;
                const penOthersLegacy = penOthersLegacyClose ? this.getNumber('PenOthers') : undefined;
                const penOthersNew = this.getNewPenAmount(false);
                sources.push(new BridgeSource('orf', this.id, 'penOthersLegacy',
                    penOthersLegacy ?? 0));
                sources.push(new BridgeSource('orf', this.id, 'penOthersNew',
                    penOthersNew ?? 0));
                sources.push(new BridgeSource('orf', this.id, 'penOthers',
                    penOthersNew ?? penOthersLegacy ?? 0));

                sources.push(new BridgeSource('orf', this.id, 'frotOthers',
                    this.getNumber('FrotOthers') ?? 0));
            }
            if (this.type === 'Pen') {
                sources.push(new BridgeSource('pen', this.id, 'touchSelf',
                    this.getBool('TouchSelfClose') ? this.getNumber('TouchSelf') ?? 0 : 0));
                sources.push(new BridgeSource('pen', this.id, 'touchOthers',
                    this.getBool('TouchOthersClose') ? this.getNumber('TouchOthers') ?? 0 : 0));
                sources.push(new BridgeSource('pen', this.id, 'penSelf',
                    this.getNumber('PenSelf') ?? 0));
                sources.push(new BridgeSource('pen', this.id, 'penOthers',
                    this.getNumber('PenOthers') ?? 0));
                sources.push(new BridgeSource('pen', this.id, 'frotOthers',
                    this.getBool('FrotOthersClose') ? this.getNumber('FrotOthers') ?? 0 : 0));
            }
            if (this.type === 'Touch') {
                sources.push(new BridgeSource('touch', this.id, 'touchSelf',
                    this.getNumber('Self') ?? 0));
                sources.push(new BridgeSource('touch', this.id, 'touchOthers',
                    this.getNumber('Others') ?? 0));
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
        const selfLength = this.recordedSelfLength.getLength();
        const othersLength = this.recordedOthersLength.getLength();
        if (selfLength) out.push(`  Nearby self-penetrator length: ${selfLength.toFixed(2)}m`);
        if (othersLength) out.push(`  Nearby penetrator length: ${othersLength.toFixed(2)}m`);
        for (const source of this.getSources()) {
            if (source.value == 0) continue;
            out.push(`  ${source.featureName}=${Math.round(source.value*100)}%`);
        }
        return out.join('\n');
    }
}

// Detects length of a penetrator given the proximity of the root and tip
// (which may be updated at unrelated times)
class GameDeviceLengthDetector {
    private length: number | undefined;
    recentSamples: number[] = [];
    badPenetratingSample: number | undefined;

    private saveSample(sample: number | undefined) {
        if (sample === undefined) {
            this.recentSamples.length = 0;
        } else {
            const maxSamples = 8;
            this.recentSamples.unshift(sample);
            if (this.recentSamples.length > maxSamples) this.recentSamples.length = maxSamples;
        }
        this.updateLengthFromSamples();
    }
    private updateLengthFromSamples() {
        this.length = this.calculateLengthFromSamples();
    }
    private calculateLengthFromSamples() {
        if (this.recentSamples.length < 4) {
            return this.badPenetratingSample;
        }
        // Find the two samples closest to each other, and choose one as the winner
        // All others are likely mis-measurements during times when we only received an update for one of the OSC values and not the other
        const sortedSamples = [...this.recentSamples];
        sortedSamples.sort();
        let smallestDiff = 1;
        let smallestDiffIndex = -1;
        for (let i = 1; i < sortedSamples.length; i++) {
            const diff = Math.abs(sortedSamples[i]! - sortedSamples[i-1]!);
            if (diff < smallestDiff) {
                smallestDiff = diff;
                smallestDiffIndex = i;
            }
        }
        if (smallestDiffIndex >= 0) return sortedSamples[smallestDiffIndex];
        return this.recentSamples[0];
    }

    getLength() {
        return this.length;
    }

    update(
        rootProxVal: OscValue|undefined,
        tipProxVal: OscValue|undefined
    ) {
        const rootProx = rootProxVal?.get();
        const tipProx = tipProxVal?.get();
        if (typeof rootProx != 'number' || typeof tipProx != 'number') {
            // Missing data
            this.badPenetratingSample = undefined;
            this.saveSample(undefined);
            return;
        }
        if (rootProx < 0.01 || tipProx < 0.01) {
            // Nobody in radius, clear recorded length
            this.badPenetratingSample = undefined;
            this.saveSample(undefined);
            return;
        }
        if (rootProx > 0.95) {
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
            // Penetrator is penetrating right now. Only use this length if we don't have anything better.
            if (this.badPenetratingSample == undefined || length > this.badPenetratingSample) {
                this.badPenetratingSample = length;
                this.updateLengthFromSamples();
            }
        } else {
            // Good to go
            this.saveSample(length);
        }
    }
}
