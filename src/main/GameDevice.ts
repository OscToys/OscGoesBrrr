import type {OscValue} from "./OscConnection";
import type {OutputLink} from "../common/configTypes";

export interface GameSource {
    id: string;
    level: number;
    // Sender speed is already motion-based; don't differentiate it again.
    disableMotionBased?: boolean;
}

type ContactName = 'TouchSelf' | 'TouchOthers' | 'FrotOthers' | 'Self' | 'Others';
type DepthContact = 'DepthSelf' | 'DepthOthers';

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
    | DepthContact
    | 'LengthMult1' | 'LengthMult2' | 'DepthRadius'
    | `${DepthContact}_PointSeparation`
    | `${DepthContact}_SenderLossyScaleZ`
    ;
type allowedGetBools =
    'TouchSelfClose'
    | 'TouchOthersClose'
    | 'FrotOthersClose'
    | 'PenOthersClose'
    ;

export default class GameDevice {
    readonly type; // Canonical names shared by the old and new OSC formats.
    readonly id;
    readonly isTps;
    private readonly _values = new Map<string, OscValue>();
    private readonly advancedDepth: boolean;
    private readonly legacyLengths = new Map<DepthContact, number>();
    private recordedSelfLength = new GameDeviceLengthDetector();
    private recordedOthersLength = new GameDeviceLengthDetector();

    constructor(type: string, id: string, isTps: boolean) {
        this.type = type === 'Plug' ? 'Pen' : type === 'Socket' ? 'Orf' : type;
        this.advancedDepth = type === 'Plug' || type === 'Socket';
        this.id = id;
        this.isTps = isTps;
    }

    addKey(key: string, value: OscValue) {
        this._values.set(key, value);
        value.on('change', () => this.onKeyChange(key));
        this.onKeyChange(key);
    }

    onKeyChange(key: string) {
        if (this.advancedDepth && this.type === 'Orf') {
            for (const contact of ['DepthSelf', 'DepthOthers'] as const) {
                if (key === 'DepthRadius' || key === contact || key === `${contact}_PointSeparation`
                    || key.startsWith(`${contact}_CollisionTag_`)) {
                    this.getSocketPlugLength(contact);
                }
            }
        }
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
        if (typeof val == 'number' && Number.isFinite(val)) return val;
        return undefined;
    }

    private isNativePlug(contact: DepthContact): boolean {
        // Legacy sender scale has no encoding guarantee. Classify by collision tags.
        const prefix = contact + '_CollisionTag_SPS/Plug/';
        for (const [key, value] of this._values) {
            const flag = value.get();
            if (key.startsWith(prefix) && (flag === true || typeof flag === 'number' && flag > 0)) return true;
        }
        return false;
    }

    private getSocketPlugLength(contact: DepthContact): number | undefined {
        const proximity = this.getNumber(contact);
        const separation = this.getNumber(`${contact}_PointSeparation`);
        if (!(proximity !== undefined && proximity > 0 && separation !== undefined && separation >= 0)) {
            this.legacyLengths.delete(contact);
            return undefined;
        }
        if (this.isNativePlug(contact)) {
            this.legacyLengths.delete(contact);
            const length = this.getNumber(`${contact}_SenderLossyScaleZ`);
            return length !== undefined && length > 0 ? length : undefined;
        }
        const cached = this.legacyLengths.get(contact);
        if (proximity >= 1 && cached !== undefined) return cached;
        const receiverRadius = this.getNumber('DepthRadius');
        if (receiverRadius === undefined || receiverRadius <= 0) return cached;
        // Legacy length spheres encode length geometrically. Saturated first contact
        // gives a lower bound, retained until an unsaturated sample improves it.
        const estimate = separation - receiverRadius * (1 - proximity);
        if (estimate > 0 && estimate <= 3) {
            this.legacyLengths.set(contact, estimate);
            return estimate;
        }
        this.legacyLengths.delete(contact);
        return undefined;
    }

    private getAdvancedDepth(self: boolean): number {
        const contact = self ? 'DepthSelf' : 'DepthOthers';
        const proximity = this.getNumber(contact);
        const separation = this.getNumber(`${contact}_PointSeparation`);
        if (!(proximity !== undefined && proximity > 0 && separation !== undefined && separation >= 0)) return 0;
        const length = this.type === 'Pen'
            ? (this.getNumber('LengthMult1') ?? 0) * (this.getNumber('LengthMult2') ?? 0)
            : this.getSocketPlugLength(contact);
        if (length === undefined || !Number.isFinite(length) || length <= 0) return 0;
        return Math.max(0, Math.min(1, 1 - separation / length));
    }

    private getTouchSource(contact: ContactName, requireClose = false): Pick<GameSource, 'level' | 'disableMotionBased'> {
        const proximity = this.getNumber(contact) ?? 0;
        const magnitude = this._values.get(contact + '_SenderVelocityMagnitude');
        if (magnitude !== undefined) {
            const speed = magnitude.get();
            // One meter/second is full intensity before scale/dead-zone controls.
            // Presence guards stale SDK velocity. Zero speed never falls back to proximity.
            return {
                level: proximity > 0 && typeof speed === 'number' && Number.isFinite(speed) ? Math.max(0, speed) : 0,
                disableMotionBased: true,
            };
        }
        return {level: !requireClose || this.getBool(`${contact}Close` as allowedGetBools) ? proximity : 0};
    }

    getSources(link: Extract<OutputLink, {kind: 'vrchat.sps.plug' | 'vrchat.sps.socket' | 'vrchat.sps.touch'}>): GameSource[] {
        const includeSet = new Set(link.filter.include.map(value => value.trim()).filter(Boolean));
        const excludeSet = new Set(link.filter.exclude.map(value => value.trim()).filter(Boolean));
        if (excludeSet.has(this.id)) return [];
        if (includeSet.size > 0 && !includeSet.has(this.id)) return [];

        const out: GameSource[] = [];
        const pushIfEnabled = (enabled: boolean, sourceKey: string, source: number | Pick<GameSource, 'level' | 'disableMotionBased'>) => {
            if (!enabled) return;
            out.push({
                id: `${this.isTps ? 'TPS' : 'OGB'}/${this.advancedDepth ? 'advanced' : 'legacy'}/${this.type}/${this.id}/${sourceKey}`,
                ...(typeof source === 'number' ? {level: source} : source),
            });
        };

        if (!this.isTps) {
            if (this.type === 'Orf' && link.kind === 'vrchat.sps.socket') {
                const touchSelf = this.getTouchSource('TouchSelf', !this.advancedDepth);
                const touchOthers = this.getTouchSource('TouchOthers', !this.advancedDepth);
                const penSelfLegacy = this.getNumber('PenSelf');
                const penSelfNew = this.getNewPenAmount(true);
                const penSelf = this.advancedDepth ? this.getAdvancedDepth(true) : penSelfNew ?? penSelfLegacy ?? 0;
                const penOthersLegacyClose = this.getBool('PenOthersClose') || this.get('PenOthersClose') == undefined;
                const penOthersLegacy = penOthersLegacyClose ? this.getNumber('PenOthers') : undefined;
                const penOthersNew = this.getNewPenAmount(false);
                const penOthers = this.advancedDepth ? this.getAdvancedDepth(false) : penOthersNew ?? penOthersLegacy ?? 0;
                const frotOthers = this.getTouchSource('FrotOthers');

                pushIfEnabled(link.ownHands, 'touchSelf', touchSelf);
                pushIfEnabled(link.otherHands, 'touchOthers', touchOthers);
                pushIfEnabled(link.myPlugs, 'penSelf', penSelf);
                pushIfEnabled(link.otherPlugs, 'penOthers', penOthers);
                pushIfEnabled(link.otherSockets, 'frotOthers', frotOthers);
            }
            if (this.type === 'Pen' && link.kind === 'vrchat.sps.plug') {
                const touchSelf = this.getTouchSource('TouchSelf', !this.advancedDepth);
                const touchOthers = this.getTouchSource('TouchOthers', !this.advancedDepth);
                const penSelf = this.advancedDepth ? this.getAdvancedDepth(true) : this.getNumber('PenSelf') ?? 0;
                const penOthers = this.advancedDepth ? this.getAdvancedDepth(false) : this.getNumber('PenOthers') ?? 0;
                const frotOthers = this.getTouchSource('FrotOthers', !this.advancedDepth);

                pushIfEnabled(link.ownHands, 'touchSelf', touchSelf);
                pushIfEnabled(link.otherHands, 'touchOthers', touchOthers);
                pushIfEnabled(link.mySockets, 'penSelf', penSelf);
                pushIfEnabled(link.otherSockets, 'penOthers', penOthers);
                pushIfEnabled(link.otherPlugs, 'frotOthers', frotOthers);
            }
            if (this.type === 'Touch' && link.kind === 'vrchat.sps.touch') {
                pushIfEnabled(link.ownHands, 'touchSelf', this.getTouchSource('Self'));
                pushIfEnabled(link.otherHands, 'touchOthers', this.getTouchSource('Others'));
            }
        } else {
            if (this.type === 'Orf' && link.kind === 'vrchat.sps.socket') {
                pushIfEnabled(link.otherPlugs, 'penOthers', this.getNumber('Depth_In') ?? 0);
            }
            if (this.type === 'Pen' && link.kind === 'vrchat.sps.plug') {
                pushIfEnabled(link.otherSockets, 'penOthers', this.getNumber('RootRoot') ?? 0);
            }
        }

        return out;
    }
}

// Detects length of a penetrator given the proximity of the root and tip
// (which may be updated at unrelated times)
class GameDeviceLengthDetector {
    private length?: number;
    recentSamples: number[] = [];
    badPenetratingSample?: number;

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
