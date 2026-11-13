import React, {useMemo, useState} from 'react';
import {Stack, Switch, Typography} from '@mui/material';
import {type PrimitiveAtom, type WritableAtom, useAtom, useAtomValue} from 'jotai';
import {selectAtom} from 'jotai/utils';
import type {OutputEditorProps} from '../../../frontend/plugins/Plugin';
import type {IntifaceOutputConfig} from '../shared/config';
import TextCommitInput from '../../../frontend/components/util/TextCommitInput';
import MyAccordion from '../../../frontend/components/util/MyAccordion';
import OutputLinks from '../../../frontend/components/settings/OutputLinks';
import {focusKeyAtom, focusOptionalKeyAtom} from '../../../frontend/utils/atomUtils';

interface NumberFieldProps {
    label: string;
    valueAtom: WritableAtom<number | undefined, [number | undefined], void>;
    placeholder?: string;
}

function NumberField({label, valueAtom, placeholder}: NumberFieldProps) {
    const [value, setValue] = useAtom(valueAtom);
    return (
        <TextCommitInput
            label={label}
            value={value === undefined ? '' : String(value)}
            placeholder={placeholder}
            onCommit={nextValue => {
                const next = nextValue.trim();
                if (!next) {
                    setValue(undefined);
                    return;
                }
                const parsed = Number(next);
                if (Number.isFinite(parsed)) setValue(parsed);
            }}
        />
    );
}

export default function IntifaceOutputEditor({outputAtom: opaqueOutputAtom, infoAtom}: OutputEditorProps) {
    // Dispatch and validation have already established that this is our device payload.
    const outputAtom = opaqueOutputAtom as PrimitiveAtom<IntifaceOutputConfig>;
    const [advancedExpanded, setAdvancedExpanded] = useState(false);
    const outputLinksAtom = useMemo(() => focusKeyAtom(outputAtom, 'links'), [outputAtom]);
    const preferLinearAtom = useMemo(() => focusKeyAtom(outputAtom, 'preferLinear'), [outputAtom]);
    const [preferLinear, setPreferLinear] = useAtom(preferLinearAtom);
    const linearAtom = useMemo(() => focusKeyAtom(outputAtom, 'linear'), [outputAtom]);
    const linearMaxvAtom = useMemo(() => focusOptionalKeyAtom(linearAtom, 'maxv'), [linearAtom]);
    const linearMaxaAtom = useMemo(() => focusOptionalKeyAtom(linearAtom, 'maxa'), [linearAtom]);
    const linearDurationMultAtom = useMemo(() => focusOptionalKeyAtom(linearAtom, 'durationMult'), [linearAtom]);
    const linearMinAtom = useMemo(() => focusOptionalKeyAtom(linearAtom, 'min'), [linearAtom]);
    const linearMaxAtom = useMemo(() => focusOptionalKeyAtom(linearAtom, 'max'), [linearAtom]);
    const linearRestingPosAtom = useMemo(() => focusOptionalKeyAtom(linearAtom, 'restingPos'), [linearAtom]);
    const linearRestingTimeAtom = useMemo(() => focusOptionalKeyAtom(linearAtom, 'restingTime'), [linearAtom]);
    const linkLevelsAtom = useMemo(
        () => selectAtom(
            infoAtom,
            (info) => info?.lastLinkValues ?? [],
            (a, b) => a.length === b.length && a.every((value, index) => value === b[index]),
        ),
        [infoAtom],
    );
    const info = useAtomValue(infoAtom);
    const showLinearActuatorOptions = Boolean(info?.showLinearActuatorOptions);
    return (
        <>
            <OutputLinks
                linksAtom={outputLinksAtom}
                linkLevelsAtom={linkLevelsAtom}
            />
            {(info?.supportsLinearPreference || showLinearActuatorOptions) && (
                <Stack spacing={0}>
                    {info?.supportsLinearPreference && (
                        <MyAccordion
                            expanded={false}
                            onChange={() => {}}
                            sx={{bgcolor: 'action.hover'}}
                            summary={
                                <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}>
                                    <Typography variant="subtitle2">Oscillation</Typography>
                                    <Switch
                                        size="small"
                                        sx={{my: '-4px'}}
                                        checked={preferLinear ?? false}
                                        onChange={(_e, checked) => setPreferLinear(checked)}
                                        slotProps={{input: {'aria-label': 'Prefer absolute position over oscillation'}}}
                                    />
                                    <Typography variant="subtitle2">Absolute Position</Typography>
                                </Stack>
                            }
                        />
                    )}
                    {showLinearActuatorOptions && (
                        <MyAccordion
                            expanded={advancedExpanded}
                            onChange={setAdvancedExpanded}
                            sx={{bgcolor: 'action.hover'}}
                            summary={<Typography variant="subtitle2">Advanced Stroker Settings</Typography>}
                        >
                            <Stack spacing={2}>
                                <Stack direction={{xs: 'column', md: 'row'}} spacing={1.5}>
                                    <NumberField label="Max Velocity (Units / Second)" valueAtom={linearMaxvAtom} placeholder="3" />
                                    <NumberField label="Max Acceleration (Units / Second^2)" valueAtom={linearMaxaAtom} placeholder="20" />
                                    <NumberField label="Duration Multiplier" valueAtom={linearDurationMultAtom} placeholder="1" />
                                </Stack>
                                <Stack direction={{xs: 'column', md: 'row'}} spacing={1.5}>
                                    <NumberField label="Min Position" valueAtom={linearMinAtom} placeholder="0" />
                                    <NumberField label="Max Position" valueAtom={linearMaxAtom} placeholder="1" />
                                    <NumberField label="Resting Position" valueAtom={linearRestingPosAtom} placeholder="0" />
                                    <NumberField label="Resting Time (seconds)" valueAtom={linearRestingTimeAtom} placeholder="3" />
                                </Stack>
                            </Stack>
                        </MyAccordion>
                    )}
                </Stack>
            )}
        </>
    );
}
