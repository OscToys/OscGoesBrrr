import type {FrontendPlugin} from './Plugin';

const modules = import.meta.glob<{default: FrontendPlugin}>('../../plugins/*/frontend/*Plugin.ts', {eager: true});
export const plugins = Object.values(modules).map(module => module.default);
export const linkDefinitions = plugins.flatMap(plugin => plugin.links ?? []).sort((a, b) => a.order - b.order);
export const linkDefinitionMap = new Map(linkDefinitions.map(definition => [definition.kind, definition]));
export const pluginPages = plugins.flatMap(plugin => plugin.pages ?? []);
export const pluginNavigation = plugins.flatMap(plugin => plugin.navigation ?? []);
