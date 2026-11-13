import type {Draft} from 'immer';
import type {Config, OutputLink} from './configTypes';
import {getPluginConfigurations} from './pluginConfiguration';

export const CONFIG_VERSION = 5;

export function getDefaultConfig(): Config {
    return {
        version: CONFIG_VERSION,
        outputs: [],
        plugins: Object.fromEntries(getPluginConfigurations().map(plugin => [plugin.id, structuredClone(plugin.defaults)])),
    };
}

export function getDefaultLinks(): OutputLink[] {
    return getPluginConfigurations().flatMap(plugin => structuredClone(plugin.defaultLinks?.() ?? []));
}

export function normalizePluginConfig(draft: Draft<Config>, source: 'load' | 'mutate'): void {
    for (const plugin of getPluginConfigurations()) {
        const settings = draft.plugins[plugin.id];
        if (settings) plugin.normalize?.(settings, source);
        for (const output of draft.outputs) {
            if (output.plugin === plugin.id) plugin.normalizeOutput?.(output);
        }
    }
}

export function upgradeConfig(raw: unknown): unknown {
    const original = raw as Record<string, unknown>;
    const version = original['version'];
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > CONFIG_VERSION) {
        throw new Error(`Unsupported config version: ${version}`);
    }
    const plugins = getPluginConfigurations();
    let config: Config;
    if (version < CONFIG_VERSION) {
        config = getDefaultConfig();
        for (const plugin of plugins) {
            if (plugin.migrateSettings) config.plugins[plugin.id] = plugin.migrateSettings(original, version);
        }
        if (!Array.isArray(original['outputs'])) throw new Error('Invalid legacy outputs');
        for (const output of original['outputs']) {
            let claimed = false;
            for (const plugin of plugins) {
                const migrated = plugin.migrateOutput?.(output, version);
                if (migrated === undefined) continue;
                if (migrated !== null) config.outputs.push(migrated);
                claimed = true;
                break;
            }
            if (!claimed) throw new Error('Unknown legacy output');
        }
        for (const output of config.outputs) {
            const links = output.links;
            for (let index = 0; index < links.length; index++) {
                const legacy = links[index]!;
                const migrated = plugins.map(plugin => plugin.migrateLink?.(legacy, version)).find(link => link !== undefined);
                if (!migrated) throw new Error(`Unknown legacy link kind: ${legacy.kind}`);
                links[index] = migrated;
            }
        }
    } else {
        config = raw as Config;
    }
    const upgrades = plugins.flatMap(plugin => {
        const settings = config.plugins[plugin.id];
        if (!settings) return [];
        if (!Number.isInteger(settings.version) || settings.version < 1 || settings.version > plugin.defaults.version) {
            throw new Error(`Unsupported ${plugin.id} config version: ${settings.version}`);
        }
        return settings.version === plugin.defaults.version ? [] : [{plugin, settings, fromVersion: settings.version}];
    });
    if (upgrades.length === 0) return config;
    const byId = new Map(upgrades.map(upgrade => [upgrade.plugin.id, upgrade]));
    for (const {plugin, settings} of upgrades) plugin.upgrade?.(settings);
    config.outputs = config.outputs.flatMap(output => {
        const upgrade = byId.get(output.plugin);
        const next = upgrade?.plugin.upgradeOutput ? upgrade.plugin.upgradeOutput(output, upgrade.fromVersion) : output;
        return next === null ? [] : [next];
    });
    // Finish device upgrades first so replacement devices' links are upgraded too, regardless of plugin order.
    for (const output of config.outputs) {
        output.links = output.links.flatMap(link => {
            const upgrade = byId.get(link.plugin);
            const next = upgrade?.plugin.upgradeLink ? upgrade.plugin.upgradeLink(link, upgrade.fromVersion) : link;
            return next === null ? [] : [next];
        });
    }
    for (const {plugin, settings} of upgrades) settings.version = plugin.defaults.version;
    return config;
}
