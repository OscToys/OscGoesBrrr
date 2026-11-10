import type {PluginConfig, PluginLink} from './plugins/contracts';
export type * from './plugins/contracts';
export {getDefaultLinks} from './plugins/configuration';

export type OutputLink = PluginLink;

export interface OutputLinkFilter {
    include: string[];
    exclude: string[];
}

export type OutputLinkKind = OutputLink["kind"];

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

export interface InputScaleModifier {
    kind: 'scale';
    scale: number;
}

export interface InputDeadZoneModifier {
    kind: 'deadZone';
    level: number;
}

export interface InputMotionBasedModifier {
    kind: 'motionBased';
}
export type InputModifier =
    | InputScaleModifier
    | InputDeadZoneModifier
    | InputMotionBasedModifier;
export type InputModifierKind = InputModifier['kind'];

export interface OutputConfig {
    id: string;
    links: OutputLink[];
    updatesPerSecond?: number; // Now unused
    linear?: Partial<OutputLinearActuatorConfig>;
    preferLinear?: boolean;
}

export function getDefaultOutput(): Omit<OutputConfig, 'id'> {
    return {
        links: [],
    };
}

export interface Config extends PluginConfig {
    version: number;
    outputs: OutputConfig[];
}
