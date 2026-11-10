import type {FrontendPlugin} from '../../../frontend/plugins/Plugin';
import ConstantLinkEditor from './ConstantLinkEditor';

export default {
    links: [
        {
            kind: 'constant',
            label: 'Constant',
            order: 4,
            create: () => ({kind: 'constant', level: 0.1}),
            summary: link => link.kind === 'constant' ? `${Math.round(link.level * 100000) / 1000}%` : '',
            Editor: ConstantLinkEditor,
        },
    ],
} satisfies FrontendPlugin;
