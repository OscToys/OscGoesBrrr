import type {FrontendPlugin} from '../../../frontend/plugins/Plugin';
import IntifaceSettingsSection from './IntifaceSettingsSection';
import {outputPresentation} from './outputPresentation';

export default {
    Settings: IntifaceSettingsSection,
    outputPresentation,
} satisfies FrontendPlugin;
