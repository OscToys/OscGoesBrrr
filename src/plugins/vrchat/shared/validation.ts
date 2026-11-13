import typia from 'typia';
import type {OutputLink} from '../../../common/configTypes';
import {isVrchatLink, type VrchatConfig, type VrchatLink} from './config';
export {PLUGIN_ID as pluginId} from './config';

export function validateConfig(raw: unknown): void {
    typia.assert<VrchatConfig>(raw);
}

export default function validateLink(link: OutputLink): boolean {
    if (!isVrchatLink(link)) return false;
    typia.assert<VrchatLink>(link);
    return true;
}
