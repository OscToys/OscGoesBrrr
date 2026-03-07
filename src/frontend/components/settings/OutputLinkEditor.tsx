import React, {useState} from 'react';
import {produce} from 'immer';
import {
    Box,
    Button,
    FormControlLabel,
    IconButton,
    Menu,
    MenuItem,
    Slider,
    Stack,
    Switch,
    Typography,
} from '@mui/material';
import {
    OutputLink,
    OutputLinkKind,
    OutputLinkMutator,
    OutputLinkMutatorKind,
    OutputLinkFilter,
    OutputLinkScaleMutator,
    OutputLinkVrchatSpsPlug, OutputLinkVrchatSpsSocket, OutputLinkVrchatTouch,
} from "../../../common/configTypes";
import TextCommitInput from "../util/TextCommitInput";
import Filter from "../Filter";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import CloseIcon from "@mui/icons-material/Close";
import MyAccordion from "../util/MyAccordion";
import {pushItem, removeAt} from "../../../common/arrayDraft";
import {type PrimitiveAtom, useAtom, useAtomValue} from "jotai";
import {selectAtom} from "jotai/utils";
import {useSettingsStateAtom} from "./SettingsStateAtomContext";

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

interface Props {
    linkAtom: PrimitiveAtom<OutputLink>;
    activeLevel: number;
    labelMap: Map<OutputLinkKind, {kind: OutputLinkKind, label: string}>;
    removeLink: (linkAtom: PrimitiveAtom<OutputLink>) => void;
}

function OutputLinkEditor({linkAtom, activeLevel, labelMap, removeLink}: Props) {
    const [expanded, setExpanded] = useState(false);
    const [addMutatorMenuAnchor, setAddMutatorMenuAnchor] = React.useState<HTMLElement | null>(null);
    const [link, setLink] = useAtom(linkAtom);
    const settingsStateAtom = useSettingsStateAtom();
    const plugIdSuggestionsAtom = React.useMemo(
        () => selectAtom(settingsStateAtom, (state) => state.detectedSpsPlugIds),
        [settingsStateAtom],
    );
    const socketIdSuggestionsAtom = React.useMemo(
        () => selectAtom(settingsStateAtom, (state) => state.detectedSpsSocketIds),
        [settingsStateAtom],
    );
    const touchZoneIdSuggestionsAtom = React.useMemo(
        () => selectAtom(settingsStateAtom, (state) => state.detectedSpsTouchZoneIds),
        [settingsStateAtom],
    );
    const plugIdSuggestions = useAtomValue(plugIdSuggestionsAtom);
    const socketIdSuggestions = useAtomValue(socketIdSuggestionsAtom);
    const touchZoneIdSuggestions = useAtomValue(touchZoneIdSuggestionsAtom);
    const label = labelMap.get(link.kind)?.label ?? link.kind;
    const formatPercent = (fraction: number) => Math.round(fraction * 100000) / 1000;
    const updateSpsFeature = (feature: SpsFeature, enabled: boolean) => {
        if (!isSpsLink(link)) return;
        setLink({...link, [feature]: enabled} as SpsLink);
    };
    const updateTouchFeature = (feature: TouchFeature, enabled: boolean) => {
        if (!isTouchLink(link)) return;
        setLink({...link, [feature]: enabled});
    };

    const updateConstant = (value: number) => {
        if (link.kind !== 'constant') return;
        setLink({kind: 'constant', level: value / 100});
    };
    const commit = (apply: (draft: OutputLink) => void) => setLink(produce(link, draft => apply(draft)));

    const supportsCommonMutators = (
        value: OutputLink,
    ): value is Extract<OutputLink, {kind: 'vrchat.sps.plug' | 'vrchat.sps.socket' | 'vrchat.sps.touch' | 'vrchat.avatarParameter'}> => {
        return value.kind === 'vrchat.sps.plug'
            || value.kind === 'vrchat.sps.socket'
            || value.kind === 'vrchat.sps.touch'
            || value.kind === 'vrchat.avatarParameter';
    };

    const supportsAudioMutators = (
        value: OutputLink,
    ): value is Extract<OutputLink, {kind: 'systemAudio'}> => {
        return value.kind === 'systemAudio';
    };

    const getMutators = (): OutputLinkMutator[] => {
        if (supportsCommonMutators(link)) return link.mutators;
        if (supportsAudioMutators(link)) return link.mutators;
        return [];
    };

    const commitMutators = (apply: (draft: OutputLinkMutator[]) => void) => {
        commit((draft) => {
            if (supportsAudioMutators(draft)) {
                apply(draft.mutators);
                draft.mutators = draft.mutators.filter((mutator): mutator is OutputLinkScaleMutator => mutator.kind === 'scale');
                return;
            }
            if (supportsCommonMutators(draft)) {
                apply(draft.mutators);
                return;
            }
        });
    };
    const mutatorOptions: {kind: OutputLinkMutatorKind, label: string}[] = supportsAudioMutators(link)
        ? [{kind: 'scale', label: 'Scale'}]
        : supportsCommonMutators(link)
            ? [
                {kind: 'scale', label: 'Scale'},
                {kind: 'deadZone', label: 'Dead Zone'},
                {kind: 'motionBased', label: 'Motion-Based'},
            ]
            : [];
    const availableMutatorOptions = mutatorOptions.filter(option => !getMutators().some(mutator => mutator.kind === option.kind));

    const buildMutator = (kind: OutputLinkMutatorKind): OutputLinkMutator => {
        switch (kind) {
            case 'scale':
                return {kind: 'scale', scale: 1};
            case 'deadZone':
                return {kind: 'deadZone', level: 0};
            case 'motionBased':
                return {kind: 'motionBased'};
        }
    };

    const addMutator = (kind: OutputLinkMutatorKind) => {
        const current = getMutators();
        if (current.some(mutator => mutator.kind === kind)) {
            setAddMutatorMenuAnchor(null);
            return;
        }
        commitMutators((draft) => pushItem(draft, buildMutator(kind)));
        setAddMutatorMenuAnchor(null);
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
    const summarizeFilter = (allLabel: string, include: string[], exclude: string[]) => {
        const includeItems = include.map(value => value.trim()).filter(Boolean);
        const excludeItems = exclude.map(value => value.trim()).filter(Boolean);
        if (includeItems.length === 0 && excludeItems.length === 0) return allLabel;
        return [...includeItems, ...excludeItems.map(value => `-${value}`)].join(" ");
    };
    const summaryDetail = (() => {
        if (link.kind === 'vrchat.sps.plug') {
            return summarizeFilter('All Plugs', link.filter.include, link.filter.exclude);
        }
        if (link.kind === 'vrchat.sps.socket') {
            return summarizeFilter('All Sockets', link.filter.include, link.filter.exclude);
        }
        if (link.kind === 'vrchat.sps.touch') {
            return summarizeFilter('All Touch Zones', link.filter.include, link.filter.exclude);
        }
        if (link.kind === 'vrchat.avatarParameter') {
            const parameter = link.parameter.trim();
            return parameter || 'Unset';
        }
        if (link.kind === 'constant') {
            return `${Math.round(link.level * 100000) / 1000}%`;
        }
        if (link.kind === 'systemAudio') {
            return '';
        }
        return '';
    })();

    const isPlug = link.kind === 'vrchat.sps.plug';
    const activePercentLabel = activeLevel > 0 ? ` (${Math.round(activeLevel * 100)}%)` : '';

    return (
        <MyAccordion
            expanded={expanded}
            onChange={setExpanded}
            sx={{
                bgcolor: 'action.hover'
            }}
            summary={
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{width: '100%'}}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{minWidth: 0, flex: 1}}>
                        <Typography variant="subtitle2">{label}{activePercentLabel}</Typography>
                    </Stack>
                    {!expanded && summaryDetail && (
                        <Typography variant="body2" color="text.secondary" sx={{minWidth: 0, mr: 1}} noWrap>{summaryDetail}</Typography>
                    )}
                    <IconButton
                        color="error"
                        size="small"
                        aria-label="Remove link"
                        onClick={(e) => {
                            e.stopPropagation();
                            removeLink(linkAtom);
                        }}
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Stack>
            }
        >
            <Stack spacing={1.25}>
                {link.kind === 'constant' && (
                    <Box>
                        <Typography variant="body2" color="text.secondary" sx={{mb: 0.5}}>
                            Level ({Math.round(link.level * 100000) / 1000}%)
                        </Typography>
                        <Slider
                            value={Math.round(link.level * 100000) / 1000}
                            min={0}
                            max={100}
                            step={1}
                            valueLabelDisplay="auto"
                            valueLabelFormat={(value) => `${value}%`}
                            onChange={(_e, value) => {
                                if (typeof value !== 'number') return;
                                updateConstant(value);
                            }}
                        />
                    </Box>
                )}

                {filterProps && <>
                    {isSpsLink(link) &&
                        <Typography variant="subtitle2">
                            {`When these ${filterProps.itemLabel}s:`}
                        </Typography>
                    }
                    <Filter {...filterProps} onChange={setFilter} />
                </>}

                {isSpsLink(link) && <>
                    <Typography variant="subtitle2">Are touched by:</Typography>
                    <Box
                        sx={{
                            display: 'grid',
                            gap: 0.25,
                            gridTemplateColumns: {xs: '1fr', md: 'repeat(3, minmax(0, 1fr))'},
                        }}
                    >
                        <FormControlLabel
                            sx={{gridColumn: {xs: 'auto', md: 1}, gridRow: {xs: 'auto', md: 1}}}
                            control={<Switch checked={link.otherHands} onChange={e => updateSpsFeature('otherHands', e.target.checked)} />}
                            label="Other Player's Hands"
                        />
                        <FormControlLabel
                            sx={{gridColumn: {xs: 'auto', md: 1}, gridRow: {xs: 'auto', md: 2}}}
                            control={<Switch checked={link.ownHands} onChange={e => updateSpsFeature('ownHands', e.target.checked)} />}
                            label="My Hands"
                        />
                        <FormControlLabel
                            sx={{gridColumn: {xs: 'auto', md: 2}, gridRow: {xs: 'auto', md: 1}}}
                            control={<Switch checked={isPlug ? link.otherSockets : link.otherPlugs} onChange={e => updateSpsFeature(isPlug ? 'otherSockets' : 'otherPlugs', e.target.checked)} />}
                            label={isPlug ? "Other Player's Sockets" : "Other Player's Plugs"}
                        />
                        <FormControlLabel
                            sx={{gridColumn: {xs: 'auto', md: 2}, gridRow: {xs: 'auto', md: 2}}}
                            control={<Switch checked={isPlug ? link.mySockets : link.myPlugs} onChange={e => updateSpsFeature(isPlug ? 'mySockets' : 'myPlugs', e.target.checked)} />}
                            label={isPlug ? "My Sockets" : "My Plugs"}
                        />
                        <FormControlLabel
                            sx={{gridColumn: {xs: 'auto', md: 3}, gridRow: {xs: 'auto', md: 1}}}
                            control={<Switch checked={isPlug ? link.otherPlugs : link.otherSockets} onChange={e => updateSpsFeature(isPlug ? 'otherPlugs' : 'otherSockets', e.target.checked)} />}
                            label={isPlug ? "Other Player's Plugs" : "Other Player's Sockets"}
                        />
                    </Box>
                </>}
                {isTouchLink(link) && <>
                    <Typography variant="subtitle2">Are touched by:</Typography>
                    <Box
                        sx={{
                            display: 'grid',
                            gap: 0.25,
                            gridTemplateColumns: {xs: '1fr', md: 'repeat(2, minmax(0, 1fr))'},
                        }}
                    >
                        <FormControlLabel
                            control={<Switch checked={link.otherHands} onChange={e => updateTouchFeature('otherHands', e.target.checked)} />}
                            label="Other Players"
                        />
                        <FormControlLabel
                            control={<Switch checked={link.ownHands} onChange={e => updateTouchFeature('ownHands', e.target.checked)} />}
                            label="Myself"
                        />
                    </Box>
                </>}

                {link.kind === 'vrchat.avatarParameter' && (
                    <TextCommitInput
                        value={link.parameter}
                        placeholder="Parameter name"
                        onCommit={value => setLink({kind: 'vrchat.avatarParameter', parameter: value.trim(), mutators: link.mutators})}
                    />
                )}

                {(supportsCommonMutators(link) || supportsAudioMutators(link)) && (
                    <Stack spacing={1}>
                        {getMutators().map((mutator, index) => {
                            const commitThisMutator = (applyDraft: (draft: OutputLinkMutator) => void) => {
                                commitMutators((draft) => {
                                    const target = draft[index];
                                    if (!target) return;
                                    applyDraft(target);
                                });
                            };
                            const removeThisMutator = () => {
                                commitMutators((draft) => removeAt(draft, index));
                            };
                            return <Box key={`${mutator.kind}-${index}`} sx={{p: 1, border: 1, borderColor: 'divider', borderRadius: 1}}>
                                <Stack spacing={1}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Typography variant="body2">
                                            {mutator.kind === 'scale' ? `Scale (${formatPercent(mutator.scale)}%)`
                                                : mutator.kind === 'deadZone' ? `Dead Zone (${formatPercent(mutator.level)}%)`
                                                    : 'Motion-Based'}
                                        </Typography>
                                        <IconButton size="small" color="error" onClick={removeThisMutator}>
                                            <CloseIcon fontSize="small" />
                                        </IconButton>
                                    </Stack>
                                    {mutator.kind === 'scale' && (
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">
                                                Increase or decrease the intensity of this link.
                                            </Typography>
                                            <Slider
                                                value={formatPercent(mutator.scale)}
                                                min={0}
                                                max={1000}
                                                step={1}
                                                valueLabelDisplay="auto"
                                                valueLabelFormat={(value) => `${value}%`}
                                                onChange={(_e, value) => {
                                                    if (typeof value !== 'number') return;
                                                    commitThisMutator((draft) => {
                                                        if (draft.kind !== 'scale') return;
                                                        draft.scale = value / 100;
                                                    });
                                                }}
                                            />
                                        </Box>
                                    )}
                                    {mutator.kind === 'deadZone' && (
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">
                                                This level will be treated as 'zero', which can be helpful for filtering out very light touches.
                                            </Typography>
                                            <Slider
                                                value={formatPercent(mutator.level)}
                                                min={0}
                                                max={100}
                                                step={1}
                                                valueLabelDisplay="auto"
                                                valueLabelFormat={(value) => `${value}%`}
                                                onChange={(_e, value) => {
                                                    if (typeof value !== 'number') return;
                                                    commitThisMutator((draft) => {
                                                        if (draft.kind !== 'deadZone') return;
                                                        draft.level = value / 100;
                                                    });
                                                }}
                                            />
                                        </Box>
                                    )}
                                    {mutator.kind === 'motionBased' && (
                                        <Typography variant="body2" color="text.secondary">
                                            Intensity will be based on motion, rather than depth.
                                        </Typography>
                                    )}
                                </Stack>
                            </Box>;
                        })}
                        {availableMutatorOptions.length > 0 && (
                            <>
                                <Button
                                    type="button"
                                    variant="outlined"
                                    size="small"
                                    sx={{alignSelf: 'flex-start'}}
                                    endIcon={<ArrowDropDownIcon />}
                                    onClick={(e) => setAddMutatorMenuAnchor(e.currentTarget)}
                                >
                                    Add Mutator
                                </Button>
                                <Menu
                                    anchorEl={addMutatorMenuAnchor}
                                    open={addMutatorMenuAnchor !== null}
                                    onClose={() => setAddMutatorMenuAnchor(null)}
                                >
                                    {availableMutatorOptions.map(option => (
                                        <MenuItem key={option.kind} onClick={() => addMutator(option.kind)}>
                                            {option.label}
                                        </MenuItem>
                                    ))}
                                </Menu>
                            </>
                        )}
                    </Stack>
                )}
            </Stack>
        </MyAccordion>
    );
}

export default React.memo(OutputLinkEditor);
