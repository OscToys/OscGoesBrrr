import type {FrontendPlugin} from '../../../frontend/plugins/Plugin';
import ConstantLinkEditor from './ConstantLinkEditor';
import {isConstantLink, PLUGIN_ID} from '../shared/config';

export default {
    id: PLUGIN_ID,
    name: 'Constant',
    links: [
        {
            plugin: PLUGIN_ID,
            kind: 'constant',
            label: 'Constant',
            order: 4,
            create: () => ({plugin: PLUGIN_ID, kind: 'constant', level: 0.1}),
            summary: link => isConstantLink(link) ? `${Math.round(link.level * 100000) / 1000}%` : '',
            Editor: ConstantLinkEditor,
        },
    ],
} satisfies FrontendPlugin;
