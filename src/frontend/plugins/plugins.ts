import type {FrontendPlugin} from './Plugin';
import '../../common/application/registerPlugins';
import type {OutputLink} from '../../common/application/configTypes';

const modules = import.meta.glob<{default: FrontendPlugin}>('../../plugins/*/frontend/*Plugin.ts', {eager: true});
export const plugins = Object.values(modules).map(module => module.default);
export const pluginsById = new Map(plugins.map(plugin => [plugin.id, plugin]));
if (plugins.some(plugin => !plugin.id) || pluginsById.size !== plugins.length) throw new Error('Invalid or duplicate frontend plugin ID');
export const linkDefinitions = plugins.flatMap(plugin => plugin.links ?? []).sort((a, b) => a.order - b.order);
export function findLinkDefinition(link: OutputLink) {
    return pluginsById.get(link.plugin)?.links?.find(definition => definition.kind === link.kind);
}
export const pluginPages = plugins.flatMap(plugin => plugin.pages ?? []);
export const pluginNavigation = plugins.flatMap(plugin => plugin.navigation ?? []);
