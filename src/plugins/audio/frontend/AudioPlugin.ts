import type {FrontendPlugin} from '../../../frontend/plugins/Plugin';
import AudioHandler from './AudioHandler';
import {isAudioLink, PLUGIN_ID} from '../shared/config';

export default {
    id: PLUGIN_ID,
    name: 'Audio',
    Runtime: AudioHandler,
    links: [
        {
            plugin: PLUGIN_ID,
            kind: 'systemAudio',
            label: 'System Audio (Unfinished Alpha)',
            order: 3,
            create: () => ({plugin: PLUGIN_ID, kind: 'systemAudio', mutators: []}),
            summary: () => '',
            modifiers: {
                kinds: ['scale'],
                get: link => isAudioLink(link) ? link.mutators : [],
                set: (link, modifiers) => isAudioLink(link) ? {
                    ...link,
                    mutators: modifiers.filter(modifier => modifier.kind === 'scale'),
                } : link,
            },
        },
    ],
} satisfies FrontendPlugin;
