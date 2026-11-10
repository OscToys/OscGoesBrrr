import type {Draft} from 'immer';
import type {Config, InputModifier, OutputLinkFilter} from '../../../common/configTypes';
import {normalizeAddress} from '../../../common/normalizeAddress';

export interface OutputLinkVrchatSpsPlug {
    kind: 'vrchat.sps.plug';
    filter: OutputLinkFilter;
    ownHands: boolean;
    otherHands: boolean;
    mySockets: boolean;
    otherSockets: boolean;
    otherPlugs: boolean;
    mutators: InputModifier[];
}
export interface OutputLinkVrchatSpsSocket {
    kind: 'vrchat.sps.socket';
    filter: OutputLinkFilter;
    ownHands: boolean;
    otherHands: boolean;
    myPlugs: boolean;
    otherPlugs: boolean;
    otherSockets: boolean;
    mutators: InputModifier[];
}
export interface OutputLinkVrchatTouch {
    kind: 'vrchat.sps.touch';
    filter: OutputLinkFilter;
    ownHands: boolean;
    otherHands: boolean;
    mutators: InputModifier[];
}
export interface OutputLinkVrchatAvatarParameter {
    kind: 'vrchat.avatarParameter';
    parameter: string;
    mutators: InputModifier[];
}
export type VrchatLink =
    | OutputLinkVrchatSpsPlug
    | OutputLinkVrchatSpsSocket
    | OutputLinkVrchatTouch
    | OutputLinkVrchatAvatarParameter;

export interface VrchatConfig {
    useOscQuery: boolean;
    maxLevelParam?: string;
    oscProxy: string[];
    vrcConfigDir?: string;
}

export const defaultConfig: VrchatConfig = {useOscQuery: true, oscProxy: []};

export function getDefaultLinks(): VrchatLink[] {
    return [
        {
            kind: 'vrchat.sps.plug',
            filter: {include: [], exclude: []},
            ownHands: false,
            otherHands: true,
            mySockets: false,
            otherSockets: true,
            otherPlugs: true,
            mutators: [],
        },
        {
            kind: 'vrchat.sps.socket',
            filter: {include: [], exclude: []},
            ownHands: false,
            otherHands: true,
            myPlugs: false,
            otherPlugs: true,
            otherSockets: true,
            mutators: [],
        },
        {
            kind: 'vrchat.sps.touch',
            filter: {include: [], exclude: []},
            ownHands: false,
            otherHands: true,
            mutators: [],
        },
    ];
}

export function normalizeConfig(draft: Draft<Config>, source: 'load' | 'mutate'): void {
    draft.oscProxy = draft.oscProxy.map(target => {
        const normalized = normalizeAddress(target, 0, true) ?? '';
        if (normalized === 'localhost:9000' || normalized === 'localhost:9001') return '';
        return normalized;
    });
    if (source === 'load') draft.oscProxy = draft.oscProxy.filter(target => target !== '');
}

// Retain the existing pre-plugin config compatibility without changing its format.
export function upgradeConfig(config: Config, version: number): void {
    if (version < 2) {
        for (const output of config.outputs) {
            for (const link of output.links) {
                const legacyLink = link as any;
                if (link.kind === 'vrchat.sps.plug') {
                    legacyLink.ownHands = legacyLink.touchSelf;
                    legacyLink.otherHands = legacyLink.touchOthers;
                    legacyLink.mySockets = legacyLink.penSelf;
                    legacyLink.otherSockets = legacyLink.penOthers;
                    legacyLink.otherPlugs = legacyLink.frotOthers;
                    delete legacyLink.touchSelf;
                    delete legacyLink.touchOthers;
                    delete legacyLink.penSelf;
                    delete legacyLink.penOthers;
                    delete legacyLink.frotOthers;
                    continue;
                }
                if (link.kind === 'vrchat.sps.socket') {
                    legacyLink.ownHands = legacyLink.touchSelf;
                    legacyLink.otherHands = legacyLink.touchOthers;
                    legacyLink.myPlugs = legacyLink.penSelf;
                    legacyLink.otherPlugs = legacyLink.penOthers;
                    legacyLink.otherSockets = legacyLink.frotOthers;
                    delete legacyLink.touchSelf;
                    delete legacyLink.touchOthers;
                    delete legacyLink.penSelf;
                    delete legacyLink.penOthers;
                    delete legacyLink.frotOthers;
                    continue;
                }
                if (link.kind === 'vrchat.sps.touch') {
                    legacyLink.ownHands = false;
                    legacyLink.otherHands = true;
                }
            }
        }
        config.version = 2;
    }

    if (version < 3) {
        config.useOscQuery = true;
        config.version = 3;
    }
}
