import type {Draft} from 'immer';
import type {InputModifier, OutputLink, OutputLinkFilter} from '../../../common/configTypes';
import type {Config, PluginConfig} from '../../../common/application/configTypes';
import {normalizeAddress} from '../../../common/normalizeAddress';
import {registerPluginConfiguration} from '../../../common/application/pluginConfiguration';

export type InteractionMode = 'off' | 'movement' | 'proximity';
export const PLUGIN_ID = 'vrchat';

export interface InteractionConfig {
    mode: InteractionMode;
    self: boolean;
    others: boolean;
}

export function createInteraction(self: boolean, others: boolean, mode: InteractionMode = 'movement'): InteractionConfig {
    return {mode: self || others ? mode : 'off', self, others: others || !self};
}

export function setInteractionParty(
    interaction: InteractionConfig,
    party: 'self' | 'others',
    enabled: boolean,
): InteractionConfig {
    const next = {...interaction, [party]: enabled};
    if (!next.self && !next.others) next[party === 'self' ? 'others' : 'self'] = true;
    return next;
}

export interface OutputLinkVrchatSpsPlug extends OutputLink {
    kind: 'vrchat.sps.plug';
    filter: OutputLinkFilter;
    hands: InteractionConfig;
    sockets: InteractionConfig;
    plugs: InteractionConfig;
    mutators: InputModifier[];
}
export interface OutputLinkVrchatSpsSocket extends OutputLink {
    kind: 'vrchat.sps.socket';
    filter: OutputLinkFilter;
    hands: InteractionConfig;
    plugs: InteractionConfig;
    sockets: InteractionConfig;
    mutators: InputModifier[];
}
export interface OutputLinkVrchatTouch extends OutputLink {
    kind: 'vrchat.sps.touch';
    filter: OutputLinkFilter;
    hands: InteractionConfig;
    mutators: InputModifier[];
}
export interface OutputLinkVrchatAvatarParameter extends OutputLink {
    kind: 'vrchat.avatarParameter';
    parameter: string;
    mutators: InputModifier[];
}
export type VrchatLink =
    | OutputLinkVrchatSpsPlug
    | OutputLinkVrchatSpsSocket
    | OutputLinkVrchatTouch
    | OutputLinkVrchatAvatarParameter;

export function isVrchatLink(link: OutputLink): link is VrchatLink {
    return link.plugin === PLUGIN_ID && (link.kind === 'vrchat.avatarParameter' || link.kind === 'vrchat.sps.plug'
        || link.kind === 'vrchat.sps.socket' || link.kind === 'vrchat.sps.touch');
}

export type ZoneLink = OutputLinkVrchatSpsPlug | OutputLinkVrchatSpsSocket | OutputLinkVrchatTouch;

export function isZoneLink(link: OutputLink): link is ZoneLink {
    return isVrchatLink(link) && link.kind !== 'vrchat.avatarParameter';
}

export interface VrchatConfig extends PluginConfig {
    useOscQuery: boolean;
    maxLevelParam?: string;
    oscProxy: string[];
    vrcConfigDir?: string;
}

export const defaultConfig: VrchatConfig = {version: 1, useOscQuery: true, oscProxy: []};

export function getSettings(config: Config): VrchatConfig {
    return config.plugins[PLUGIN_ID] as VrchatConfig;
}

export function getDefaultLinks(): VrchatLink[] {
    return [
        {
            plugin: PLUGIN_ID,
            kind: 'vrchat.sps.plug',
            filter: {include: [], exclude: []},
            hands: createInteraction(false, true),
            sockets: createInteraction(false, true, 'proximity'),
            plugs: createInteraction(false, true),
            mutators: [],
        },
        {
            plugin: PLUGIN_ID,
            kind: 'vrchat.sps.socket',
            filter: {include: [], exclude: []},
            hands: createInteraction(false, true),
            plugs: createInteraction(false, true, 'proximity'),
            sockets: createInteraction(false, true),
            mutators: [],
        },
        {
            plugin: PLUGIN_ID,
            kind: 'vrchat.sps.touch',
            filter: {include: [], exclude: []},
            hands: createInteraction(false, true),
            mutators: [],
        },
    ];
}

export function normalizeConfig(draft: Draft<VrchatConfig>, source: 'load' | 'mutate'): void {
    draft.oscProxy = draft.oscProxy.map(target => {
        const normalized = normalizeAddress(target, 0, true) ?? '';
        if (normalized === 'localhost:9000' || normalized === 'localhost:9001') return '';
        return normalized;
    });
    if (source === 'load') draft.oscProxy = draft.oscProxy.filter(target => target !== '');
}

function migrateLink(legacy: Record<string, unknown>, version: number): VrchatLink | undefined {
    const link = {...legacy, plugin: PLUGIN_ID} as OutputLink;
    if (!isVrchatLink(link)) return undefined;
    if (version < 2 && isZoneLink(link)) {
        link['ownHands'] = link.kind === 'vrchat.sps.touch' ? false : link['touchSelf'];
        link['otherHands'] = link.kind === 'vrchat.sps.touch' ? true : link['touchOthers'];
        if (link.kind === 'vrchat.sps.plug') {
            link['mySockets'] = link['penSelf'];
            link['otherSockets'] = link['penOthers'];
            link['otherPlugs'] = link['frotOthers'];
        }
        if (link.kind === 'vrchat.sps.socket') {
            link['myPlugs'] = link['penSelf'];
            link['otherPlugs'] = link['penOthers'];
            link['otherSockets'] = link['frotOthers'];
        }
        for (const key of ['touchSelf', 'touchOthers', 'penSelf', 'penOthers', 'frotOthers']) delete link[key];
    }
    const motionBased = link.mutators.some(modifier => (modifier as {kind: string}).kind === 'motionBased');
    const readParty = (key: string) => {
        const value = link[key];
        if (typeof value !== 'boolean') throw new Error(`Invalid legacy interaction: ${key}`);
        delete link[key];
        return value;
    };
    if (isZoneLink(link)) {
        link.hands = createInteraction(readParty('ownHands'), readParty('otherHands'));
        const depthMode = motionBased ? 'movement' : 'proximity';
        if (link.kind === 'vrchat.sps.plug') {
            link.sockets = createInteraction(readParty('mySockets'), readParty('otherSockets'), depthMode);
            link.plugs = createInteraction(false, readParty('otherPlugs'));
        }
        if (link.kind === 'vrchat.sps.socket') {
            link.plugs = createInteraction(readParty('myPlugs'), readParty('otherPlugs'), depthMode);
            link.sockets = createInteraction(false, readParty('otherSockets'));
        }
    }
    // This modifier no longer exists, including on arbitrary avatar parameters.
    link.mutators = link.mutators.filter(modifier => (modifier as {kind: string}).kind !== 'motionBased');
    return link;
}

registerPluginConfiguration({
    id: PLUGIN_ID,
    defaults: {...defaultConfig},
    defaultLinks: getDefaultLinks,
    normalize: (draft, source) => normalizeConfig(draft as Draft<VrchatConfig>, source),
    migrateSettings: (legacy, version) => ({
        version: 1,
        useOscQuery: version < 3 ? true : legacy['useOscQuery'] as boolean,
        oscProxy: legacy['oscProxy'] as string[],
        ...(legacy['maxLevelParam'] !== undefined ? {maxLevelParam: legacy['maxLevelParam'] as string} : {}),
        ...(legacy['vrcConfigDir'] !== undefined ? {vrcConfigDir: legacy['vrcConfigDir'] as string} : {}),
    }),
    migrateLink,
});
