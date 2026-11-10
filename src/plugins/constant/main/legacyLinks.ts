import type {OutputLinkConstant} from '../shared/config';
import type {LegacyLinkOptions} from '../../../main/plugins/LegacyLinkOptions';

export function importLegacyLinks({idleLevel}: LegacyLinkOptions): OutputLinkConstant[] {
    return idleLevel > 0 ? [{kind: 'constant', level: idleLevel}] : [];
}
