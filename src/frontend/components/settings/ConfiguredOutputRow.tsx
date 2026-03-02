import React, {useState} from "react";
import {produce} from "immer";
import {Output} from "../../../common/configTypes";
import {OutputDeviceInfo} from "../../../common/ipcContract";
import {Alert, Box, IconButton, Stack, Typography} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import {DotPath, getTypedPathValue, PathValue, setTypedPathValue} from "../../utils/typedPath";
import TextCommitInput from "../util/TextCommitInput";
import MyAccordion from "../util/MyAccordion";
import CountdownText, {formatDuration} from "../util/CountdownText";
import OutputLinks from "./OutputLinks";
import ConnectionBubble from "./ConnectionBubble";

const LEGACY_ALL_OUTPUT_ID = "intiface.imported.all";
const LEGACY_OUTPUT_ID_PREFIX = "intiface.imported.";

function getLegacyDisplayName(id: string): string | undefined {
    if (!id.startsWith(LEGACY_OUTPUT_ID_PREFIX)) return undefined;
    const name = id.substring(LEGACY_OUTPUT_ID_PREFIX.length);
    return `Imported Config: ${name}`;
}

interface Props {
    output: Output;
    index: number;
    info?: OutputDeviceInfo;
    importedAllDeletesAt?: number;
    onChange: (index: number, output: Output) => void;
    onDelete: (outputId: string) => void;
}

export default function ConfiguredOutputRow({output, index, info, importedAllDeletesAt, onChange, onDelete}: Props) {
    type OutputPath = DotPath<Output>;
    type NumberPath = {
        [P in OutputPath]: PathValue<Output, P> extends number | undefined ? P : never
    }[OutputPath];

    const [expanded, setExpanded] = useState(false);
    const [advancedExpanded, setAdvancedExpanded] = useState(false);
    const displayName = getLegacyDisplayName(output.id) ?? info?.name ?? output.id;
    const showLinearActuatorOptions = Boolean(info?.showLinearActuatorOptions);
    const commitOutput = (nextOutput: Output) => onChange(index, nextOutput);
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
    const renderNumberField = ({label, path, placeholder}: {label: string, path: NumberPath, placeholder?: string}) => {
        const rawValue = getTypedPathValue(output, path);
        return (
            <TextCommitInput
                label={label}
                value={rawValue === undefined ? '' : String(rawValue)}
                placeholder={placeholder}
                onCommit={nextValue => {
                    const next = nextValue.trim();
                    if (!next) {
                        commitOutput(setTypedPathValue(output, path, undefined));
                        return;
                    }
                    const parsed = Number(next);
                    if (Number.isFinite(parsed)) commitOutput(setTypedPathValue(output, path, parsed));
                }}
            />
        );
    };

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
                    links={output.links}
                    onChangeLinks={(nextLinks) => commitOutput(produce(output, (draft) => {
                        draft.links = nextLinks;
                    }))}
                />
                <Stack spacing={0}>
                    <MyAccordion
                        expanded={advancedExpanded}
                        onChange={setAdvancedExpanded}
                        sx={{bgcolor: 'action.hover'}}
                        summary={<Typography variant="subtitle2">Advanced Device Settings</Typography>}
                    >
                        <Stack spacing={2}>
                            {renderNumberField({label: "Update Rate (Hz) (DO NOT CHANGE unless device gets delayed by seconds/minutes over time)", path: "updatesPerSecond", placeholder: "15"})}

                            {showLinearActuatorOptions && (
                                <>
                                    <Typography variant="subtitle2">Linear Actuator</Typography>
                                    <Stack direction={{xs: 'column', md: 'row'}} spacing={1.5}>
                                        {renderNumberField({label: "Max Velocity (Units / Second)", path: "linear.maxv", placeholder: "3"})}
                                        {renderNumberField({label: "Max Acceleration (Units / Second^2)", path: "linear.maxa", placeholder: "20"})}
                                        {renderNumberField({label: "Duration Multiplier", path: "linear.durationMult", placeholder: "1"})}
                                    </Stack>
                                    <Stack direction={{xs: 'column', md: 'row'}} spacing={1.5}>
                                        {renderNumberField({label: "Min Position", path: "linear.min", placeholder: "0"})}
                                        {renderNumberField({label: "Max Position", path: "linear.max", placeholder: "1"})}
                                        {renderNumberField({label: "Resting Position", path: "linear.restingPos", placeholder: "0"})}
                                        {renderNumberField({label: "Resting Time (seconds)", path: "linear.restingTime", placeholder: "3"})}
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
