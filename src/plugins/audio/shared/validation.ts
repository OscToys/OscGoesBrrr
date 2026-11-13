import typia from 'typia';
import type {OutputLink} from '../../../common/configTypes';
import {isAudioLink, type OutputLinkSystemAudio} from './config';
export {PLUGIN_ID as pluginId} from './config';

export default function validateLink(link: OutputLink): boolean {
    if (!isAudioLink(link)) return false;
    typia.assert<OutputLinkSystemAudio>(link);
    return true;
}
