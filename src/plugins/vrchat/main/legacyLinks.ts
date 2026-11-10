import type {InputModifier} from '../../../common/configTypes';
import type {VrchatLink} from '../shared/config';
import clamp from '../../../common/clamp';
import type {LegacyLinkOptions} from '../../../main/plugins/LegacyLinkOptions';

export function importLegacyLinks({
    type,
    include,
    bindKeys,
    touchSelf,
    touchOthers,
    selfDepth,
    othersDepth,
    frotOthers,
    motionBased,
    idleLevel,
    scale,
}: LegacyLinkOptions): VrchatLink[] {
    const spsAvatarMutators: InputModifier[] = [];
    if (idleLevel < 0) {
        const deadZone = -idleLevel / (1 - idleLevel);
        spsAvatarMutators.push({kind: 'deadZone', level: clamp(deadZone, 0, 1)});
    }
    if (scale !== 1) spsAvatarMutators.push({kind: 'scale', scale});
    if (motionBased) spsAvatarMutators.push({kind: 'motionBased'});
    const allowPlugZones = type === 'all' || type === 'pen';
    const allowSocketZones = type === 'all' || type === 'orf';
    const links: VrchatLink[] = [];
    if (allowPlugZones) {
        links.push({
            kind: "vrchat.sps.plug",
            filter: {include, exclude: []},
            ownHands: touchSelf,
            otherHands: touchOthers,
            mySockets: selfDepth,
            otherSockets: othersDepth,
            otherPlugs: frotOthers,
            mutators: structuredClone(spsAvatarMutators),
        });
    }
    if (allowSocketZones) {
        links.push({
            kind: "vrchat.sps.socket",
            filter: {include, exclude: []},
            ownHands: touchSelf,
            otherHands: touchOthers,
            myPlugs: selfDepth,
            otherPlugs: othersDepth,
            otherSockets: frotOthers,
            mutators: structuredClone(spsAvatarMutators),
        });
    }
    links.push({
        kind: "vrchat.sps.touch",
        filter: {include, exclude: []},
        ownHands: touchSelf,
        otherHands: touchOthers,
        mutators: structuredClone(spsAvatarMutators),
    });
    for (const parameter of bindKeys) {
        links.push({kind: "vrchat.avatarParameter", parameter, mutators: structuredClone(spsAvatarMutators)});
    }

    return links;
}
