import type {Draft} from 'immer';
import type {Config} from '../../../common/configTypes';
import {normalizeAddress} from '../../../common/normalizeAddress';

export interface IntifaceConfig {
    intifaceAddress?: string;
    useIntifaceMdns: boolean;
}

export const defaultConfig: IntifaceConfig = {useIntifaceMdns: true};

export function normalizeConfig(draft: Draft<Config>): void {
    const address = normalizeAddress(draft.intifaceAddress, 12345);
    if (address === undefined || address === 'ws://localhost:12345') delete draft.intifaceAddress;
    else draft.intifaceAddress = address;
}

export function upgradeConfig(config: Config, version: number): void {
    if (version < 4) config.useIntifaceMdns = false;
}
