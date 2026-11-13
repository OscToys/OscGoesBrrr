import typia from 'typia';
import type {IntifaceConfig, IntifaceOutputConfig} from './config';
export {PLUGIN_ID as pluginId} from './config';

export function validateConfig(raw: unknown): void {
    typia.assert<IntifaceConfig>(raw);
}

export function validateOutput(raw: unknown): void {
    typia.assert<IntifaceOutputConfig>(raw);
}
