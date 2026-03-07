import React, {useMemo, useState} from "react";
import {Output} from "../../../common/configTypes";
import {OutputDeviceInfo} from "../../../common/ipcContract";
import {Alert, IconButton, Stack, Typography} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import TextCommitInput from "../util/TextCommitInput";
import MyAccordion from "../util/MyAccordion";
import CountdownText, {formatDuration} from "../util/CountdownText";
import OutputLinks from "./OutputLinks";
import ConnectionBubble from "./ConnectionBubble";
import {type Atom, type PrimitiveAtom, useAtom, useAtomValue, type WritableAtom} from "jotai";
import {selectAtom} from "jotai/utils";
import {focusKeyAtom, focusOptionalKeyAtom} from "../../utils/atomUtils";

const LEGACY_ALL_OUTPUT_ID = "intiface.imported.all";
const LEGACY_OUTPUT_ID_PREFIX = "intiface.imported.";

function getLegacyDisplayName(id: string): string | undefined {
    if (!id.startsWith(LEGACY_OUTPUT_ID_PREFIX)) return undefined;
    const name = id.substring(LEGACY_OUTPUT_ID_PREFIX.length);
    return `Imported Config: ${name}`;
}

interface Props {
    outputAtom: PrimitiveAtom<Output>;
    infoAtom: Atom<OutputDeviceInfo | undefined>;
    importedAllDeletesAt?: number;
    onDelete: (outputId: string) => void;
}

function NumberField({label, valueAtom, placeholder}: {label: string, valueAtom: WritableAtom<number | undefined, [number | undefined], void>, placeholder?: string}) {
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

function ConfiguredOutputRow({outputAtom, infoAtom, importedAllDeletesAt, onDelete}: Props) {
    const [expanded, setExpanded] = useState(false);
    const [advancedExpanded, setAdvancedExpanded] = useState(false);
    const outputLinksAtom = useMemo(() => focusKeyAtom(outputAtom, 'links'), [outputAtom]);
    const updatesPerSecondAtom = useMemo(() => focusKeyAtom(outputAtom, 'updatesPerSecond'), [outputAtom]);
    const linearAtom = useMemo(() => focusKeyAtom(outputAtom, 'linear'), [outputAtom]);
    const linearMaxvAtom = useMemo(() => focusOptionalKeyAtom(linearAtom, 'maxv'), [linearAtom]);
    const linearMaxaAtom = useMemo(() => focusOptionalKeyAtom(linearAtom, 'maxa'), [linearAtom]);
    const linearDurationMultAtom = useMemo(() => focusOptionalKeyAtom(linearAtom, 'durationMult'), [linearAtom]);
    const linearMinAtom = useMemo(() => focusOptionalKeyAtom(linearAtom, 'min'), [linearAtom]);
    const linearMaxAtom = useMemo(() => focusOptionalKeyAtom(linearAtom, 'max'), [linearAtom]);
    const linearRestingPosAtom = useMemo(() => focusOptionalKeyAtom(linearAtom, 'restingPos'), [linearAtom]);
    const linearRestingTimeAtom = useMemo(() => focusOptionalKeyAtom(linearAtom, 'restingTime'), [linearAtom]);
    const outputNonLinkAtom = useMemo(
        () => selectAtom(
            outputAtom,
            (output) => ({id: output.id, updatesPerSecond: output.updatesPerSecond, linear: output.linear}),
            (a, b) => a.id === b.id && a.updatesPerSecond === b.updatesPerSecond && a.linear === b.linear,
        ),
        [outputAtom],
    );
    const output = useAtomValue(outputNonLinkAtom);
    const info = useAtomValue(infoAtom);
    const displayName = getLegacyDisplayName(output.id) ?? info?.name ?? output.id;
    const showLinearActuatorOptions = Boolean(info?.showLinearActuatorOptions);
    const warningText = (() => {
        if (!output.id.startsWith(LEGACY_OUTPUT_ID_PREFIX)) return undefined;
        if (output.id !== LEGACY_ALL_OUTPUT_ID) {
            return "This imported device config came from an old version of OGB, and will be restored next time a matching device is connected.";
        }
        if (importedAllDeletesAt === undefined) {
            return "This imported 'all' config came from an old version of OGB, and will be used for all newly-connected devices.";
        }
        return (
            <CountdownText targetTime={importedAllDeletesAt}>
                {(remaining) => {
                    if (remaining <= 0) {
                        return "This imported 'all' config came from an old version of OGB, and will be used for all newly-connected devices.";
                    }
                    return `This imported 'all' config came from an old version of OGB, and will be used for all newly-connected devices for the next ${formatDuration(remaining)}.`;
                }}
            </CountdownText>
        );
    })();

    return (
        <MyAccordion
            expanded={expanded}
            onChange={setExpanded}
            summary={
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{width: '100%'}}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <ConnectionBubble color={info?.connected ? 'success.main' : 'error.main'} />
                        <Typography variant="h6">{displayName}</Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" color="text.secondary">{output.id}</Typography>
                        <IconButton
                            component="span"
                            color="error"
                            size="small"
                            aria-label="Unlink output"
                            onClick={e => {
                                e.stopPropagation();
                                onDelete(output.id);
                            }}
                        >
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                </Stack>
            }
        >
            <Stack spacing={2}>
                {warningText != null && (
                    <Alert severity="warning">{warningText}</Alert>
                )}
                <OutputLinks
                    linksAtom={outputLinksAtom}
                />
                <Stack spacing={0}>
                    <MyAccordion
                        expanded={advancedExpanded}
                        onChange={setAdvancedExpanded}
                        sx={{bgcolor: 'action.hover'}}
                        summary={<Typography variant="subtitle2">Advanced Device Settings</Typography>}
                    >
                        <Stack spacing={2}>
                            <NumberField
                                label="Update Rate (Hz) (DO NOT CHANGE unless device gets delayed by seconds/minutes over time)"
                                valueAtom={updatesPerSecondAtom}
                                placeholder="15"
                            />

                            {showLinearActuatorOptions && (
                                <>
                                    <Typography variant="subtitle2">Linear Actuator</Typography>
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
                                </>
                            )}
                        </Stack>
                    </MyAccordion>
                </Stack>
            </Stack>
        </MyAccordion>
    );
}

export default React.memo(ConfiguredOutputRow);
