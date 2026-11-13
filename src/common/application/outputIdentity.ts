export interface OutputIdentity {
    plugin: string;
    id: string;
}

/** Application/UI identity only. The engine tracks endpoint objects, not these keys. */
export function outputKey(output: OutputIdentity): string {
    return JSON.stringify([output.plugin, output.id]);
}
