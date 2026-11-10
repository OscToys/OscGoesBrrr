import React from 'react';
import {Box, FormControlLabel, Switch, Typography} from '@mui/material';
import {useAtom, useAtomValue} from 'jotai';
import {selectAtom} from 'jotai/utils';
import type {
    OutputLink,
    OutputLinkFilter,
    OutputLinkVrchatSpsPlug,
    OutputLinkVrchatSpsSocket,
    OutputLinkVrchatTouch,
} from '../../../common/configTypes';
import TextCommitInput from '../../../frontend/components/util/TextCommitInput';
import Filter from '../../../frontend/components/Filter';
import {useSettingsStateAtom} from '../../../frontend/components/settings/SettingsStateAtomContext';
import type {LinkEditorProps} from '../../../frontend/plugins/Plugin';

type SpsLink = OutputLinkVrchatSpsPlug | OutputLinkVrchatSpsSocket;
type SpsFeature =
    | 'ownHands'
    | 'otherHands'
    | 'mySockets'
    | 'otherSockets'
    | 'otherPlugs'
    | 'myPlugs';
type TouchFeature = 'ownHands' | 'otherHands';

function isSpsLink(link: OutputLink): link is OutputLinkVrchatSpsPlug | OutputLinkVrchatSpsSocket {
    return link.kind === 'vrchat.sps.plug' || link.kind === 'vrchat.sps.socket';
}

function isTouchLink(link: OutputLink): link is OutputLinkVrchatTouch {
    return link.kind === 'vrchat.sps.touch';
}

export default function VrchatLinkEditor({linkAtom}: LinkEditorProps) {
    const [link, setLink] = useAtom(linkAtom);
    const settingsStateAtom = useSettingsStateAtom();
    const plugIdSuggestionsAtom = React.useMemo(
        () => selectAtom(settingsStateAtom, (state) => state.vrchat.detectedSpsPlugIds),
        [settingsStateAtom],
    );
    const socketIdSuggestionsAtom = React.useMemo(
        () => selectAtom(settingsStateAtom, (state) => state.vrchat.detectedSpsSocketIds),
        [settingsStateAtom],
    );
    const touchZoneIdSuggestionsAtom = React.useMemo(
        () => selectAtom(settingsStateAtom, (state) => state.vrchat.detectedSpsTouchZoneIds),
        [settingsStateAtom],
    );
    const plugIdSuggestions = useAtomValue(plugIdSuggestionsAtom);
    const socketIdSuggestions = useAtomValue(socketIdSuggestionsAtom);
    const touchZoneIdSuggestions = useAtomValue(touchZoneIdSuggestionsAtom);
    const updateSpsFeature = (feature: SpsFeature, enabled: boolean) => {
        if (!isSpsLink(link)) return;
        setLink({...link, [feature]: enabled} as SpsLink);
    };
    const updateTouchFeature = (feature: TouchFeature, enabled: boolean) => {
        if (!isTouchLink(link)) return;
        setLink({...link, [feature]: enabled});
    };

    const setFilter = (nextFilter: OutputLinkFilter) => {
        if (link.kind !== 'vrchat.sps.plug' && link.kind !== 'vrchat.sps.socket' && link.kind !== 'vrchat.sps.touch') return;
        setLink({...link, filter: nextFilter});
    };

    const filterProps = (() => {
        if (link.kind !== 'vrchat.sps.plug' && link.kind !== 'vrchat.sps.socket' && link.kind !== 'vrchat.sps.touch') {
            return undefined;
        }
        const itemLabel =
            link.kind === 'vrchat.sps.plug' ? 'Plug'
            : link.kind === 'vrchat.sps.socket' ? 'Socket'
            : 'Touch Zone';
        const suggestions =
            link.kind === 'vrchat.sps.plug' ? plugIdSuggestions
            : link.kind === 'vrchat.sps.socket' ? socketIdSuggestions
            : touchZoneIdSuggestions;
        return {filter: link.filter, itemLabel, suggestions};
    })();
    const isPlug = link.kind === 'vrchat.sps.plug';
    return <>
        {filterProps && <>
            <Typography variant="subtitle2">
                {`Trigger when these ${filterProps.itemLabel}s:`}
            </Typography>
            <Filter {...filterProps} onChange={setFilter} />
        </>}

        {isSpsLink(link) && <>
            <Typography variant="subtitle2">are touched by:</Typography>
            <Box
                sx={{
                    display: 'grid',
                    gap: 0.25,
                    gridTemplateColumns: {xs: '1fr', md: 'repeat(2, minmax(0, 1fr))'},
                }}
            >
                <FormControlLabel
                    sx={{gridColumn: {xs: 'auto', md: 1}, gridRow: {xs: 'auto', md: 1}}}
                    control={<Switch checked={isPlug ? link.otherSockets : link.otherPlugs} onChange={e => updateSpsFeature(isPlug ? 'otherSockets' : 'otherPlugs', e.target.checked)} />}
                    label={isPlug ? "Other Player's SPS Sockets" : "Other Player's SPS Plugs"}
                />
                <FormControlLabel
                    sx={{gridColumn: {xs: 'auto', md: 1}, gridRow: {xs: 'auto', md: 2}}}
                    control={<Switch checked={link.otherHands} onChange={e => updateSpsFeature('otherHands', e.target.checked)} />}
                    label="Other Player's Hands / Feet / Head"
                />
                <FormControlLabel
                    sx={{gridColumn: {xs: 'auto', md: 1}, gridRow: {xs: 'auto', md: 3}}}
                    control={<Switch checked={isPlug ? link.otherPlugs : link.otherSockets} onChange={e => updateSpsFeature(isPlug ? 'otherPlugs' : 'otherSockets', e.target.checked)} />}
                    label={isPlug ? "Other Player's SPS Plugs" : "Other Player's SPS Sockets"}
                />
                <FormControlLabel
                    sx={{gridColumn: {xs: 'auto', md: 2}, gridRow: {xs: 'auto', md: 1}}}
                    control={<Switch checked={isPlug ? link.mySockets : link.myPlugs} onChange={e => updateSpsFeature(isPlug ? 'mySockets' : 'myPlugs', e.target.checked)} />}
                    label={isPlug ? "My SPS Sockets" : "My SPS Plugs"}
                />
                <FormControlLabel
                    sx={{gridColumn: {xs: 'auto', md: 2}, gridRow: {xs: 'auto', md: 2}}}
                    control={<Switch checked={link.ownHands} onChange={e => updateSpsFeature('ownHands', e.target.checked)} />}
                    label="My Hands / Feet"
                />
            </Box>
        </>}
        {isTouchLink(link) && <>
            <Typography variant="subtitle2">are touched by:</Typography>
            <FormControlLabel
                control={<Switch checked={link.otherHands} onChange={e => updateTouchFeature('otherHands', e.target.checked)} />}
                label="Other Player's Hands / Feet / Head / SPS Plugs"
            />
            <FormControlLabel
                control={<Switch checked={link.ownHands} onChange={e => updateTouchFeature('ownHands', e.target.checked)} />}
                label="My Hands / Feet / SPS Plugs"
            />
        </>}

        {link.kind === 'vrchat.avatarParameter' && (
            <TextCommitInput
                value={link.parameter}
                placeholder="Parameter name"
                onCommit={value => setLink({kind: 'vrchat.avatarParameter', parameter: value.trim(), mutators: link.mutators})}
            />
        )}

    </>;
}
