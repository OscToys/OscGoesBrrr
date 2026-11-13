import {faBarsStaggered, faCircleNodes} from '@fortawesome/free-solid-svg-icons';
import type {FrontendPlugin, LinkDefinition} from '../../../frontend/plugins/Plugin';
import VrchatSettingsSection from './VrchatSettingsSection';
import VrchatLinkEditor from './VrchatLinkEditor';
import AvatarParams from './AvatarParams';
import {summarizeLink} from './LinkSummary';
import {getDefaultLinks, isVrchatLink, PLUGIN_ID} from '../shared/config';

const modifiers: LinkDefinition['modifiers'] = {
    kinds: ['scale', 'deadZone'],
    get: link => isVrchatLink(link) ? link.mutators : [],
    set: (link, mutators) => isVrchatLink(link) ? {...link, mutators} : link,
};

const zoneLabels = ['SPS Plugs', 'SPS Sockets', 'SPS Touch Zones'];
const links: LinkDefinition[] = getDefaultLinks().map((link, index) => ({
    plugin: PLUGIN_ID,
    kind: link.kind,
    label: zoneLabels[index]!,
    order: index,
    create: () => structuredClone(link),
    summary: summarizeLink,
    Editor: VrchatLinkEditor,
    modifiers,
}));
links.push({
    plugin: PLUGIN_ID,
    kind: 'vrchat.avatarParameter',
    label: 'VRC Avatar Parameter',
    order: 5,
    create: () => ({plugin: PLUGIN_ID, kind: 'vrchat.avatarParameter', parameter: '', mutators: []}),
    summary: summarizeLink,
    Editor: VrchatLinkEditor,
    modifiers,
});

export default {
    id: PLUGIN_ID,
    name: 'VRChat',
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
