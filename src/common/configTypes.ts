/** Shared plugin-link envelope. The engine receives resolved samples, not this payload. */
export interface OutputLink {
    [key: string]: unknown;
    kind: string;
    plugin: string;
    enabled?: boolean;
}

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

export type InputModifier =
    | InputScaleModifier
    | InputDeadZoneModifier;
export type InputModifierKind = InputModifier['kind'];

export interface OutputSettings {
    enabled?: boolean;
    linear?: Partial<OutputLinearActuatorConfig>;
}
