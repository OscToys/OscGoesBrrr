export type OutputControlType = 'linear' | 'vibrate' | 'rotate';

export function isOutputControlType(type: string): type is OutputControlType {
    return type === 'linear' || type === 'vibrate' || type === 'rotate';
}

/** A controllable output, independent of its transport or device integration. */
export interface OutputEndpoint {
    readonly type: string;
    /** Last commanded normalized value, not measured physical position. */
    readonly lastLevel: number;
    /** Rotation accepts signed values; linear outputs can use duration in ms. */
    setLevel(value: number, duration?: number): void;
}
