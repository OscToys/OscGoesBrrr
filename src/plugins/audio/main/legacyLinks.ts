import type {OutputLinkSystemAudio} from '../shared/config';
import type {LegacyLinkOptions} from '../../../main/plugins/LegacyLinkOptions';

export function importLegacyLinks({legacyAudioMultiplier, scale}: LegacyLinkOptions): OutputLinkSystemAudio[] {
    if (legacyAudioMultiplier <= 0) return [];
    const multiplier = legacyAudioMultiplier * scale;
    return [
        {
            kind: 'systemAudio',
            mutators: multiplier !== 1 ? [{kind: 'scale', scale: multiplier}] : [],
        },
    ];
}
