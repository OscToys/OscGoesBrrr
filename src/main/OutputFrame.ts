import type {OutputSettings} from '../common/configTypes';
import type {OutputEndpoint} from './OutputEndpoint';
import type {ResolvedLink} from './routing';

/** A plugin supplies resolved inputs and settings; the endpoint object is the stable handle. */
export interface OutputFrame {
    output: OutputEndpoint;
    inputs: readonly ResolvedLink[];
    settings: OutputSettings;
}
