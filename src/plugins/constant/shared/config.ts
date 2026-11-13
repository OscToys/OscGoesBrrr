import type {OutputLink} from '../../../common/configTypes';
import {registerPluginConfiguration} from '../../../common/application/pluginConfiguration';

export const PLUGIN_ID = 'constant';

export interface OutputLinkConstant extends OutputLink {
    kind: 'constant';
    level: number;
}

export function isConstantLink(link: OutputLink): link is OutputLinkConstant {
    return link.plugin === PLUGIN_ID && link.kind === 'constant';
}

registerPluginConfiguration({
    id: PLUGIN_ID,
    order: 20,
    defaults: {version: 1},
    migrateLink: legacy => legacy['kind'] === 'constant' ? {...legacy, plugin: PLUGIN_ID} as OutputLinkConstant : undefined,
});
