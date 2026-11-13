import type {InputScaleModifier, OutputLink} from '../../../common/configTypes';
import {registerPluginConfiguration} from '../../../common/application/pluginConfiguration';

export const PLUGIN_ID = 'audio';

export interface OutputLinkSystemAudio extends OutputLink {
    kind: 'systemAudio';
    mutators: InputScaleModifier[];
}

export function isAudioLink(link: OutputLink): link is OutputLinkSystemAudio {
    return link.plugin === PLUGIN_ID && link.kind === 'systemAudio';
}

registerPluginConfiguration({
    id: PLUGIN_ID,
    order: 10,
    defaults: {version: 1},
    migrateLink: legacy => legacy['kind'] === 'systemAudio' ? {...legacy, plugin: PLUGIN_ID} as OutputLinkSystemAudio : undefined,
});
