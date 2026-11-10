import type {InputScaleModifier} from '../../../common/configTypes';

export interface OutputLinkSystemAudio {
    kind: 'systemAudio';
    mutators: InputScaleModifier[];
}
