import React, {useState} from 'react';
import {produce} from 'immer';
import {
    Box,
    Button,
    IconButton,
    Menu,
    MenuItem,
    Slider,
    Stack,
    Typography,
} from '@mui/material';
import {
    OutputLink,
    InputModifier,
    InputModifierKind,
} from "../../../common/configTypes";
import {ArrowDropDown as ArrowDropDownIcon, Close as CloseIcon, Waves as WavesIcon} from "@mui/icons-material";
import MyAccordion from "../util/MyAccordion";
import {pushItem, removeAt} from "../../../common/arrayDraft";
import {type PrimitiveAtom, useAtom} from "jotai";

import {linkDefinitionMap} from '../../plugins/plugins';

interface Props {
    linkAtom: PrimitiveAtom<OutputLink>;
    activeLevel: number;
    removeLink: (linkAtom: PrimitiveAtom<OutputLink>) => void;
}

function OutputLinkEditor({linkAtom, activeLevel, removeLink}: Props) {
    const [expanded, setExpanded] = useState(false);
    const [addMutatorMenuAnchor, setAddMutatorMenuAnchor] = React.useState<HTMLElement | null>(null);
    const [link, setLink] = useAtom(linkAtom);
    const definition = linkDefinitionMap.get(link.kind);
    const label = definition?.label ?? link.kind;
    const summaryDetail = definition?.summary(link);
    const Editor = definition?.Editor;
    const formatPercent = (fraction: number) => Math.round(fraction * 100000) / 1000;
    const getMutators = () => definition?.modifiers?.get(link) ?? [];
    const commitMutators = (apply: (draft: InputModifier[]) => void) => {
        if (!definition?.modifiers) return;
        setLink(definition.modifiers.set(link, produce(getMutators(), apply)));
    };
    const modifierLabels: Record<InputModifierKind, string> = {
        scale: 'Scale',
        deadZone: 'Dead Zone',
        motionBased: 'Motion-Based',
    };
    const mutatorOptions = (definition?.modifiers?.kinds ?? []).map(kind => ({kind, label: modifierLabels[kind]}));
    const availableMutatorOptions = mutatorOptions.filter(option => !getMutators().some(mutator => mutator.kind === option.kind));

    const buildMutator = (kind: InputModifierKind): InputModifier => {
        switch (kind) {
            case 'scale':
                return {kind: 'scale', scale: 1};
            case 'deadZone':
                return {kind: 'deadZone', level: 0};
            case 'motionBased':
                return {kind: 'motionBased'};
        }
    };

    const addMutator = (kind: InputModifierKind) => {
        const current = getMutators();
        if (current.some(mutator => mutator.kind === kind)) {
            setAddMutatorMenuAnchor(null);
            return;
        }
        commitMutators((draft) => pushItem(draft, buildMutator(kind)));
        setAddMutatorMenuAnchor(null);
    };

    const activePercent = activeLevel > 0 ? Math.round(activeLevel * 100) : 0;

    return (
        <MyAccordion
            expanded={expanded}
            onChange={setExpanded}
            sx={{
                bgcolor: 'action.hover'
            }}
            summary={
                <Stack direction="row" sx={{width: '100%', alignItems: 'center', justifyContent: 'space-between'}}>
                    <Stack direction="row" spacing={1} sx={{minWidth: 0, flex: 1, alignItems: 'center'}}>
                        <Typography variant="subtitle2">{label}</Typography>
                    </Stack>
                    {activePercent > 0 && (
                        <Stack direction="row" spacing={0.25} sx={{alignItems: 'center'}}>
                            <WavesIcon sx={{fontSize: 14, color: 'text.secondary'}} />
                            <Typography variant="body2" color="text.secondary">{activePercent}%</Typography>
                        </Stack>
                    )}
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
                {Editor && <Editor linkAtom={linkAtom} />}

                {definition?.modifiers && (
                    <Stack spacing={1}>
                        {getMutators().map((mutator, index) => {
                            const commitThisMutator = (applyDraft: (draft: InputModifier) => void) => {
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
                                    <Stack direction="row" sx={{justifyContent: 'space-between', alignItems: 'center'}}>
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
