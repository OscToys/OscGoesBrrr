import type {Draft} from 'immer';
import {normalizeAddress} from '../../../common/normalizeAddress';
import type {Config, OutputConfig, PluginConfig} from '../../../common/application/configTypes';
import type {OutputLinearActuatorConfig} from '../../../common/configTypes';
import {getDefaultLinks} from '../../../common/application/configuration';
import {registerPluginConfiguration} from '../../../common/application/pluginConfiguration';

export const PLUGIN_ID = 'intiface';

export interface IntifaceConfig extends PluginConfig {
    intifaceAddress?: string;
    useIntifaceMdns: boolean;
}

export interface IntifaceOutputConfig extends OutputConfig {
    linear?: Partial<OutputLinearActuatorConfig>;
    updatesPerSecond?: number;
    preferLinear?: boolean;
}

export const defaultConfig: IntifaceConfig = {version: 1, useIntifaceMdns: true};

export function getSettings(config: Config): IntifaceConfig {
    return config.plugins[PLUGIN_ID] as IntifaceConfig;
}

export function getOutput(config: Config, id: string): IntifaceOutputConfig | undefined {
    return config.outputs.find(output => output.plugin === PLUGIN_ID && output.id === id) as IntifaceOutputConfig | undefined;
}

export function createOutput(id: string): IntifaceOutputConfig {
    return {plugin: PLUGIN_ID, id, links: getDefaultLinks()};
}

export function normalizeConfig(draft: Draft<IntifaceConfig>): void {
    const address = normalizeAddress(draft.intifaceAddress, 12345);
    if (address === undefined || address === 'ws://localhost:12345') delete draft.intifaceAddress;
    else draft.intifaceAddress = address;
}

registerPluginConfiguration({
    id: PLUGIN_ID,
    defaults: {...defaultConfig},
    normalize: draft => normalizeConfig(draft as Draft<IntifaceConfig>),
    normalizeOutput: draft => {
        const output = draft as Draft<IntifaceOutputConfig>;
        if (output.linear && Object.values(output.linear).every(value => value === undefined)) delete output.linear;
    },
    migrateSettings: (legacy, version) => ({
        version: 1,
        useIntifaceMdns: version < 4 ? false : legacy['useIntifaceMdns'] as boolean,
        ...(legacy['intifaceAddress'] !== undefined ? {intifaceAddress: legacy['intifaceAddress'] as string} : {}),
    }),
    migrateOutput: legacy => {
        // Placeholder configs from the removed TXT importer are not real devices.
        if (typeof legacy['id'] === 'string' && legacy['id'].startsWith('intiface.imported.')) return null;
        return {...legacy, plugin: PLUGIN_ID} as IntifaceOutputConfig;
    },
});
