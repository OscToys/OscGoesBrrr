export interface LegacyLinkOptions {
    type: string;
    include: string[];
    bindKeys: string[];
    touchSelf: boolean;
    touchOthers: boolean;
    selfDepth: boolean;
    othersDepth: boolean;
    frotOthers: boolean;
    motionBased: boolean;
    idleLevel: number;
    scale: number;
    legacyAudioMultiplier: number;
}
