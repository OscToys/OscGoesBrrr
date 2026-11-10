export type OutputControlType = 'linear' | 'vibrate' | 'rotate';

/** A controllable output, independent of its transport or device integration. */
export interface OutputEndpoint {
    readonly id: string;
    readonly type: OutputControlType;
    /** Last commanded normalized value, not measured physical position. */
    readonly lastLevel: number;
    /** Rotation accepts signed values; linear outputs can use duration in ms. */
    setLevel(value: number, duration?: number): void;
}
