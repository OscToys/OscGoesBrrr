import typia from 'typia';
import type {OutputLink} from '../../../common/configTypes';
import {isConstantLink, type OutputLinkConstant} from './config';
export {PLUGIN_ID as pluginId} from './config';

export default function validateLink(link: OutputLink): boolean {
    if (!isConstantLink(link)) return false;
    typia.assert<OutputLinkConstant>(link);
    return true;
}
