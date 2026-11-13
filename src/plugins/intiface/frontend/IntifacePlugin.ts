import type {FrontendPlugin} from '../../../frontend/plugins/Plugin';
import IntifaceSettingsSection from './IntifaceSettingsSection';
import {outputPresentation} from './outputPresentation';
import {createOutput, PLUGIN_ID} from '../shared/config';
import IntifaceOutputEditor from './IntifaceOutputEditor';

export default {
    id: PLUGIN_ID,
    name: 'Intiface',
    createOutput,
    OutputEditor: IntifaceOutputEditor,
    Settings: IntifaceSettingsSection,
    outputPresentation,
} satisfies FrontendPlugin;
