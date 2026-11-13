import React, {type ReactNode} from 'react';
import {faArrowsLeftRight} from '@fortawesome/free-solid-svg-icons';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import type {OutputLink} from '../../../common/application/configTypes';
import {isVrchatLink, isZoneLink} from '../shared/config';

export function summarizeSelection(link: OutputLink): string {
    if (!isZoneLink(link)) return '';
    const include = link.filter.include.map(value => value.trim()).filter(Boolean);
    const exclude = link.filter.exclude.map(value => value.trim()).filter(Boolean);
    return include.length || exclude.length
        ? [...include, ...exclude.map(value => `-${value}`)].join(', ')
        : 'All';
}

export function summarizeLink(link: OutputLink): ReactNode {
    if (!isVrchatLink(link)) return '';
    if (link.kind === 'vrchat.avatarParameter') return link.parameter.trim() || 'Unset';
    const targets: string[] = [];
    const opposing = link.kind === 'vrchat.sps.plug' ? link.sockets
        : link.kind === 'vrchat.sps.socket' ? link.plugs : undefined;
    const opposingLabel = link.kind === 'vrchat.sps.plug' ? 'Sockets' : 'Plugs';
    if (opposing && opposing.mode !== 'off' && opposing.others) targets.push(`Other ${opposingLabel}`);
    if (link.hands.mode !== 'off' && link.hands.others) targets.push('Other Hands');
    // Matching types are others-only, regardless of the stored party flags.
    if (link.kind === 'vrchat.sps.plug' && link.plugs.mode !== 'off') targets.push('Other Plugs');
    if (link.kind === 'vrchat.sps.socket' && link.sockets.mode !== 'off') targets.push('Other Sockets');
    if (opposing && opposing.mode !== 'off' && opposing.self) targets.push(`My ${opposingLabel}`);
    if (link.hands.mode !== 'off' && link.hands.self) targets.push('My Hands');
    return <>
        {summarizeSelection(link)}
        {' '}
        <FontAwesomeIcon icon={faArrowsLeftRight} style={{verticalAlign: 'middle', margin: '0 0.25rem'}} />
        {' '}
        {targets.join(', ') || 'None'}
    </>;
}
