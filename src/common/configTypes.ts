export interface OutputLinkFilter {
    include: string[];
    exclude: string[];
}

export interface OutputLinkVrchatSpsPlug {
    kind: 'vrchat.sps.plug';
    filter: OutputLinkFilter;
    ownHands: boolean;
    otherHands: boolean;
    mySockets: boolean;
    otherSockets: boolean;
    otherPlugs: boolean;
    mutators: OutputLinkMutator[];
}
export interface OutputLinkVrchatSpsSocket {
    kind: 'vrchat.sps.socket';
    filter: OutputLinkFilter;
    ownHands: boolean;
    otherHands: boolean;
    myPlugs: boolean;
    otherPlugs: boolean;
    otherSockets: boolean;
    mutators: OutputLinkMutator[];
}
export interface OutputLinkVrchatTouch {
    kind: 'vrchat.sps.touch';
    filter: OutputLinkFilter;
    ownHands: boolean;
    otherHands: boolean;
    mutators: OutputLinkMutator[];
}
export interface OutputLinkVrchatAvatarParameter {
    kind: 'vrchat.avatarParameter';
    parameter: string;
    mutators: OutputLinkMutator[];
}
export interface OutputLinkSystemAudio {
    kind: 'systemAudio';
    mutators: OutputLinkScaleMutator[];
}
export interface OutputLinkConstant {
    kind: 'constant';
    level: number;
}

export type OutputLink =
    | OutputLinkVrchatSpsPlug
    | OutputLinkVrchatSpsSocket
    | OutputLinkVrchatTouch
    | OutputLinkVrchatAvatarParameter
    | OutputLinkSystemAudio
    | OutputLinkConstant;

export type OutputLinkKind = OutputLink["kind"];

export function getDefaultLinks(): OutputLink[] {
    return [
        {
            kind: 'vrchat.sps.plug',
            filter: {include: [], exclude: []},
            ownHands: false,
            otherHands: true,
            mySockets: false,
            otherSockets: true,
            otherPlugs: true,
            mutators: [],
        },
        {
            kind: 'vrchat.sps.socket',
            filter: {include: [], exclude: []},
            ownHands: false,
            otherHands: true,
            myPlugs: false,
            otherPlugs: true,
            otherSockets: true,
            mutators: [],
        },
        {
            kind: 'vrchat.sps.touch',
            filter: {include: [], exclude: []},
            ownHands: false,
            otherHands: true,
            mutators: [],
        },
    ];
}

export interface OutputLinearActuatorConfig {
    maxv: number;
    maxa: number;
    durationMult: number;
    restingPos: number;
    restingTime: number;
    min: number;
    max: number;
}

export function getDefaultLinearActuatorConfig(): OutputLinearActuatorConfig {
    return {
        maxv: 3,
        maxa: 20,
        durationMult: 1,
        restingPos: 0,
        restingTime: 3,
        min: 0,
        max: 1,
    };
}

export interface OutputLinkScaleMutator {
    kind: 'scale';
    scale: number;
}

export interface OutputLinkDeadZoneMutator {
    kind: 'deadZone';
    level: number;
}

export interface OutputLinkMotionBasedMutator {
    kind: 'motionBased';
}

export interface OutputLinkAbsoluteDepthMutator {
    kind: 'absoluteDepth';

    /**
     * Insertion depth which gives this link full intensity, as a fraction of the player's eye
     * height (0.06 = 6%, which is about 10cm for someone 1.6m tall). Because it's relative to the
     * player, it follows them when they change size and needs no calibration per avatar.
     */
    fullPowerDepthFraction: number;

    /**
     * The penetrator length to assume when the real length can't be detected, in meters.
     * Used while OGB has not measured the length of the penetrator yet, and for penetration
     * sources which never carry length data (such as plug-side links).
     */
    assumedLengthMeters: number;
}

export function getDefaultAbsoluteDepthMutator(): OutputLinkAbsoluteDepthMutator {
    return {
        kind: 'absoluteDepth',
        fullPowerDepthFraction: 0.06,
        assumedLengthMeters: 0.15,
    };
}

export type OutputLinkMutator =
    | OutputLinkScaleMutator
    | OutputLinkDeadZoneMutator
    | OutputLinkMotionBasedMutator
    | OutputLinkAbsoluteDepthMutator;
export type OutputLinkMutatorKind = OutputLinkMutator['kind'];

export interface Output {
    id: string;
    links: OutputLink[];
    updatesPerSecond?: number; // Now unused
    linear?: Partial<OutputLinearActuatorConfig>;
}

export function getDefaultOutput(): Omit<Output, 'id'> {
    return {
        links: [],
    };
}

export interface Config {
    version: number;
    intifaceAddress?: string;
    useIntifaceMdns: boolean;
    useOscQuery: boolean;
    maxLevelParam?: string;
    oscProxy: string[];
    vrcConfigDir?: string;
    outputs: Output[];
}
