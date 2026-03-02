export interface OutputLinkFilter {
    include: string[];
    exclude: string[];
}

export interface OutputLinkVrchatSpsPlug {
    kind: 'vrchat.sps.plug';
    filter: OutputLinkFilter;
    touchSelf: boolean;
    touchOthers: boolean;
    penSelf: boolean;
    penOthers: boolean;
    frotOthers: boolean;
    mutators: OutputLinkMutator[];
}
export interface OutputLinkVrchatSpsSocket {
    kind: 'vrchat.sps.socket';
    filter: OutputLinkFilter;
    touchSelf: boolean;
    touchOthers: boolean;
    penSelf: boolean;
    penOthers: boolean;
    frotOthers: boolean;
    mutators: OutputLinkMutator[];
}
export interface OutputLinkVrchatTouch {
    kind: 'vrchat.sps.touch';
    filter: OutputLinkFilter;
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
            touchSelf: false,
            touchOthers: true,
            penSelf: false,
            penOthers: true,
            frotOthers: true,
            mutators: [],
        },
        {
            kind: 'vrchat.sps.socket',
            filter: {include: [], exclude: []},
            touchSelf: false,
            touchOthers: true,
            penSelf: false,
            penOthers: true,
            frotOthers: true,
            mutators: [],
        },
        {
            kind: 'vrchat.sps.touch',
            filter: {include: [], exclude: []},
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
export type OutputLinkMutator =
    | OutputLinkScaleMutator
    | OutputLinkDeadZoneMutator
    | OutputLinkMotionBasedMutator;
export type OutputLinkMutatorKind = OutputLinkMutator['kind'];

export interface Output {
    id: string;
    links: OutputLink[];
    updatesPerSecond?: number;
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
    maxLevelParam?: string;
    oscProxy: string[];
    vrcConfigDir?: string;
    outputs: Output[];
}
