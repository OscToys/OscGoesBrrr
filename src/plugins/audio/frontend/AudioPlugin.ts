import type {FrontendPlugin} from '../../../frontend/plugins/Plugin';
import AudioHandler from './AudioHandler';

export default {
    Runtime: AudioHandler,
    links: [
        {
            kind: 'systemAudio',
            label: 'System Audio (Unfinished Alpha)',
            order: 3,
            create: () => ({kind: 'systemAudio', mutators: []}),
            summary: () => '',
            modifiers: {
                kinds: ['scale'],
                get: link => link.kind === 'systemAudio' ? link.mutators : [],
                set: (link, modifiers) => link.kind === 'systemAudio' ? {
                    ...link,
                    mutators: modifiers.filter(modifier => modifier.kind === 'scale'),
                } : link,
            },
        },
    ],
} satisfies FrontendPlugin;
