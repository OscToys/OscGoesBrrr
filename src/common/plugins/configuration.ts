import type {Draft} from 'immer';
import type {Config, OutputLink} from '../configTypes';
import * as vrchat from '../../plugins/vrchat/shared/config';
import * as intiface from '../../plugins/intiface/shared/config';

export const CONFIG_VERSION = 4;

export function getDefaultConfig(): Config {
    return {
        version: CONFIG_VERSION,
        ...structuredClone(intiface.defaultConfig),
        ...structuredClone(vrchat.defaultConfig),
        outputs: [],
    };
}

export function getDefaultLinks(): OutputLink[] {
    return vrchat.getDefaultLinks();
}

export function normalizePluginConfig(draft: Draft<Config>, source: 'load' | 'mutate'): void {
    intiface.normalizeConfig(draft);
    vrchat.normalizeConfig(draft, source);
}

export function upgradeConfig(raw: unknown): unknown {
    const config = raw as Config;
    const version = config.version;
    if (!version || version < 1) throw new Error(`Unknown config version during upgrade: ${version}`);
    if (version > CONFIG_VERSION) throw new Error(`Unsupported config version: ${version}`);
    // Missing-file and reset loads reuse the frozen defaults, which need no upgrade.
    if (version === CONFIG_VERSION) return config;
    vrchat.upgradeConfig(config, version);
    intiface.upgradeConfig(config, version);
    config.version = CONFIG_VERSION;
    return config;
}
