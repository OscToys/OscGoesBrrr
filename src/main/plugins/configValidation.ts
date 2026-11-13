import typia from 'typia';
import type {Config, OutputLink} from '../../common/application/configTypes';
import {CONFIG_VERSION} from '../../common/application/configuration';
import {getPluginConfigurations} from '../../common/application/pluginConfiguration';

type LinkValidator = (link: OutputLink) => boolean;
interface PluginValidation {
    pluginId: string;
    default?: LinkValidator;
    validateConfig?(raw: unknown): void;
    validateOutput?(raw: unknown): void;
}
const modules = import.meta.glob<PluginValidation>(
    '../../plugins/*/shared/validation.ts',
    {eager: true},
);
const validators = new Map(Object.values(modules).map(module => [module.pluginId, module]));
if (validators.size !== Object.keys(modules).length) throw new Error('Duplicate plugin validator ID');

export function parseConfig(raw: unknown): Config {
    const config = typia.assert<Config>(raw);
    if (config.version !== CONFIG_VERSION) throw new Error(`Unsupported config version: ${config.version}`);
    if (Object.keys(config).some(key => !['version', 'outputs', 'plugins'].includes(key))) throw new Error('Unknown top-level config key');
    for (const [id, settings] of Object.entries(config.plugins)) {
        if (!Number.isInteger(settings.version) || settings.version < 1) throw new Error(`Invalid ${id} config version`);
    }
    for (const plugin of getPluginConfigurations()) {
        const settings = config.plugins[plugin.id];
        if (!settings) throw new Error(`Missing plugin settings: ${plugin.id}`);
        if (settings.version !== plugin.defaults.version) throw new Error(`Unsupported ${plugin.id} config version: ${settings.version}`);
        validators.get(plugin.id)?.validateConfig?.(settings);
    }
    for (const output of config.outputs) {
        validators.get(output.plugin)?.validateOutput?.(output);
        for (const link of output.links) {
            validators.get(link.plugin)?.default?.(link);
        }
    }
    return config;
}
