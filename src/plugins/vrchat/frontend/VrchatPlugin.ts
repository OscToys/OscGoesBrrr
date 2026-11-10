import {faBarsStaggered, faCircleNodes} from '@fortawesome/free-solid-svg-icons';
import type {FrontendPlugin, LinkDefinition} from '../../../frontend/plugins/Plugin';
import {getDefaultLinks, type OutputLink} from '../../../common/configTypes';
import VrchatSettingsSection from './VrchatSettingsSection';
import VrchatLinkEditor from './VrchatLinkEditor';
import AvatarParams from './AvatarParams';

function summarizeLink(link: OutputLink): string {
    if (link.kind === 'vrchat.avatarParameter') return link.parameter.trim() || 'Unset';
    if (!('filter' in link)) return '';
    const include = link.filter.include.map(value => value.trim()).filter(Boolean);
    const exclude = link.filter.exclude.map(value => value.trim()).filter(Boolean);
    if (include.length || exclude.length) return [...include, ...exclude.map(value => `-${value}`)].join(' ');
    if (link.kind === 'vrchat.sps.plug') return 'All Plugs';
    if (link.kind === 'vrchat.sps.socket') return 'All Sockets';
    return 'All Touch Zones';
}

function isVrchatLink(link: OutputLink): link is Extract<OutputLink, {kind: `vrchat.${string}`}> {
    return link.kind.startsWith('vrchat.');
}

const modifiers: LinkDefinition['modifiers'] = {
    kinds: ['scale', 'deadZone', 'motionBased'],
    get: link => isVrchatLink(link) ? link.mutators : [],
    set: (link, mutators) => isVrchatLink(link) ? {...link, mutators} : link,
};

const zoneLabels = ['SPS Plugs', 'SPS Sockets', 'SPS Touch Zones'];
const links: LinkDefinition[] = getDefaultLinks().map((link, index) => ({
    kind: link.kind,
    label: zoneLabels[index]!,
    order: index,
    create: () => structuredClone(link),
    summary: summarizeLink,
    Editor: VrchatLinkEditor,
    modifiers,
}));
links.push({
    kind: 'vrchat.avatarParameter',
    label: 'VRC Avatar Parameter',
    order: 5,
    create: () => ({kind: 'vrchat.avatarParameter', parameter: '', mutators: []}),
    summary: summarizeLink,
    Editor: VrchatLinkEditor,
    modifiers,
});

export default {
    Settings: VrchatSettingsSection,
    links,
    pages: [
        {id: 'avatarParams', label: 'Avatar Debugger', icon: faBarsStaggered, Component: AvatarParams},
    ],
    navigation: [
        {
            id: 'vrcgroup',
            label: 'VRChat Group',
            icon: faCircleNodes,
            href: 'https://vrchat.com/home/group/grp_b64197f9-2d97-499a-93d3-1e3a37c944ae',
        },
    ],
} satisfies FrontendPlugin;
