import type * as Engine from '../configTypes';

export * from '../configTypes';
export {getDefaultLinks} from './configuration';

/** Plugins own the payload; unclaimed kinds survive load/save unchanged. */
export type OutputLink = Engine.OutputLink;
export type OutputLinkKind = OutputLink['kind'];
export interface OutputConfig {
    [key: string]: unknown;
    plugin: string;
    id: string;
    enabled?: boolean;
    /** Shared boundary: device settings belong to this plugin; each link belongs to its own plugin. */
    links: OutputLink[];
}
export interface PluginConfig {
    [key: string]: unknown;
    version: number;
}
export interface Config {
    version: number;
    outputs: OutputConfig[];
    plugins: Record<string, PluginConfig>;
}
