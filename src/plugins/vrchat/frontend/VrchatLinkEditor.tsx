import React from 'react';
import {Box, Stack, ToggleButton, ToggleButtonGroup, Typography} from '@mui/material';
import {useAtom, useAtomValue} from 'jotai';
import {selectAtom} from 'jotai/utils';
import type {OutputLinkFilter} from '../../../common/application/configTypes';
import {isVrchatLink, isZoneLink, setInteractionParty, type InteractionConfig, type InteractionMode} from '../shared/config';
import TextCommitInput from '../../../frontend/components/util/TextCommitInput';
import Filter from '../../../frontend/components/Filter';
import {useSettingsStateAtom} from '../../../frontend/components/settings/SettingsStateAtomContext';
import type {LinkEditorProps} from '../../../frontend/plugins/Plugin';

type InteractionFeature = 'hands' | 'sockets' | 'plugs';

export default function VrchatLinkEditor({linkAtom}: LinkEditorProps) {
    const [link, setLink] = useAtom(linkAtom);
    const settingsStateAtom = useSettingsStateAtom();
    const suggestionsAtom = React.useMemo(
        () => selectAtom(
            settingsStateAtom,
            state => link.kind === 'vrchat.sps.plug' ? state.vrchat.detectedSpsPlugIds
                : link.kind === 'vrchat.sps.socket' ? state.vrchat.detectedSpsSocketIds : state.vrchat.detectedSpsTouchZoneIds,
        ),
        [settingsStateAtom, link.kind],
    );
    const suggestions = useAtomValue(suggestionsAtom);
    if (!isVrchatLink(link)) return null;
    const updateFeature = (feature: InteractionFeature, interaction: InteractionConfig) => {
        if (!isZoneLink(link) || !(feature in link)) return;
        setLink({...link, [feature]: interaction});
    };
    const setFilter = (filter: OutputLinkFilter) => {
        if (isZoneLink(link)) setLink({...link, filter});
    };
    const isPlug = link.kind === 'vrchat.sps.plug';
    const itemLabel = isPlug ? 'Plug' : link.kind === 'vrchat.sps.socket' ? 'Socket' : 'Touch Zone';
    const interactions: {feature: InteractionFeature; label: string; othersOnly?: boolean}[] = link.kind === 'vrchat.sps.touch' ? [
        {feature: 'hands', label: 'Hands / Feet / Head / SPS Plugs'},
    ] : [
        {feature: isPlug ? 'sockets' : 'plugs', label: isPlug ? 'Sockets' : 'Plugs'},
        {feature: 'hands', label: 'Hands / Feet / Head'},
        {feature: isPlug ? 'plugs' : 'sockets', label: isPlug ? 'Plugs' : 'Sockets', othersOnly: true},
    ];

    return <>
        {isZoneLink(link) && <>
            <Typography variant="subtitle2">{`Trigger when these ${itemLabel}s:`}</Typography>
            <Filter filter={link.filter} itemLabel={itemLabel} suggestions={suggestions} onChange={setFilter} />
            <Typography variant="subtitle2">are touched by:</Typography>
            <Box
                sx={{
                    display: 'grid',
                    gap: 1,
                }}
            >
                {interactions.map(({feature, label, othersOnly}) => {
                    const interaction = feature === 'hands' ? link.hands : link.kind !== 'vrchat.sps.touch' ? link[feature] : undefined;
                    if (!interaction) return null;
                    return <Box key={feature} sx={{'& .MuiToggleButton-root': {py: '3px', px: '9px'}}}>
                        <Typography variant="body2" sx={{mb: 0.5}}>{label}</Typography>
                        <Stack direction="row" spacing={1} useFlexGap sx={{flexWrap: 'wrap'}}>
                            <ToggleButtonGroup
                                exclusive
                                size="small"
                                color="primary"
                                value={interaction.mode}
                                aria-label={label}
                                onChange={(_event, mode: InteractionMode | null) => {
                                    if (mode !== null) updateFeature(feature, {...interaction, mode});
                                }}
                            >
                                <ToggleButton value="off" color="standard">Off</ToggleButton>
                                <ToggleButton value="movement">Movement</ToggleButton>
                                <ToggleButton value="proximity">Proximity</ToggleButton>
                            </ToggleButtonGroup>
                            <ToggleButtonGroup
                                size="small"
                                color="primary"
                                value={othersOnly ? ['others'] : (['self', 'others'] as const).filter(party => interaction[party])}
                                aria-label={`${label}: players`}
                            >
                                {!othersOnly && <ToggleButton
                                    value="self"
                                    onClick={() => updateFeature(feature, setInteractionParty(interaction, 'self', !interaction.self))}
                                >My Own</ToggleButton>}
                                <ToggleButton
                                    value="others"
                                    disabled={othersOnly}
                                    sx={{'&.Mui-disabled.Mui-selected': {color: 'primary.main'}}}
                                    onClick={() => updateFeature(feature, setInteractionParty(interaction, 'others', !interaction.others))}
                                >Other Players</ToggleButton>
                            </ToggleButtonGroup>
                        </Stack>
                    </Box>;
                })}
            </Box>
        </>}
        {link.kind === 'vrchat.avatarParameter' && (
            <TextCommitInput
                value={link.parameter}
                placeholder="Parameter name"
                onCommit={value => setLink({...link, parameter: value.trim()})}
            />
        )}
    </>;
}
