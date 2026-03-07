import React, {useCallback, useMemo, useState} from 'react';
import {produce} from 'immer';
import {Config, getDefaultLinks, getDefaultOutput, type Output} from '../../../common/configTypes';
import {pushItem, removeAt, replaceAt} from "../../../common/arrayDraft";
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    InputAdornment,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import TextCommitInput from "../util/TextCommitInput";
import {SettingsStatePayload} from "../../../common/ipcContract";
import MyAccordion from "../util/MyAccordion";
import ConfiguredOutputRow from "./ConfiguredOutputRow";
import UnconfiguredOutputRow from "./UnconfiguredOutputRow";
import ConnectionBubble from "./ConnectionBubble";
import {atom, type PrimitiveAtom, useAtom, useAtomValue, useSetAtom} from "jotai";
import {selectAtom, splitAtom} from "jotai/utils";
import {atomFamily} from "jotai-family";
import {focusKeyAtom} from "../../utils/atomUtils";

interface Props {
    configAtom: PrimitiveAtom<Config>;
    settingsStateAtom: PrimitiveAtom<SettingsStatePayload>;
}

function SettingsBody({
    configAtom,
    settingsStateAtom,
}: Props) {
    const [intifaceExpanded, setIntifaceExpanded] = useState(false);
    const [vrchatExpanded, setVrchatExpanded] = useState(false);
    const [pendingDeleteOutputId, setPendingDeleteOutputId] = useState<string | null>(null);
    const intifaceAddressAtom = useMemo(() => focusKeyAtom(configAtom, 'intifaceAddress'), [configAtom]);
    const maxLevelParamAtom = useMemo(() => focusKeyAtom(configAtom, 'maxLevelParam'), [configAtom]);
    const vrcConfigDirAtom = useMemo(() => focusKeyAtom(configAtom, 'vrcConfigDir'), [configAtom]);
    const oscProxyAtom = useMemo(() => focusKeyAtom(configAtom, 'oscProxy'), [configAtom]);
    const configuredOutputsAtom = useMemo(() => focusKeyAtom(configAtom, 'outputs'), [configAtom]);
    const outputInfosAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.outputs), [settingsStateAtom]);
    const intifaceConnectedAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.intifaceConnected), [settingsStateAtom]);
    const vrchatConnectedAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.vrchatConnected), [settingsStateAtom]);
    const importedAllDeletesAtAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.importedAllDeletesAt), [settingsStateAtom]);
    const detectedVrcConfigDirAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.detectedVrcConfigDir), [settingsStateAtom]);
    const configuredOutputIdSetAtom = useMemo(
        () => atom((get) => new Set(get(configuredOutputsAtom).map(output => output.id))),
        [configuredOutputsAtom],
    );
    const configuredOutputAtomsAtom = useMemo(() => splitAtom(configuredOutputsAtom), [configuredOutputsAtom]);
    const configuredSortedOutputsAtom = useMemo(
        () => atom<PrimitiveAtom<Output>[]>((get) => {
            const outputAtoms = get(configuredOutputAtomsAtom);
            const outputInfos = get(outputInfosAtom);
            const connectedById = new Map(outputInfos.map(info => [info.id, info.connected]));
            return [...outputAtoms].sort((a, b) => {
                const aConnected = Boolean(connectedById.get(get(a).id));
                const bConnected = Boolean(connectedById.get(get(b).id));
                if (aConnected === bConnected) return 0;
                return aConnected ? -1 : 1;
            });
        }),
        [configuredOutputAtomsAtom, outputInfosAtom],
    );
    const configuredOutputCountAtom = useMemo(
        () => selectAtom(configuredOutputsAtom, outputs => outputs.length),
        [configuredOutputsAtom],
    );
    const unconfiguredOutputsAtom = useMemo(
        () => atom((get) => {
            const allOutputs = get(outputInfosAtom);
            const configuredOutputIds = get(configuredOutputIdSetAtom);
            return allOutputs
                .filter(output => output.connected)
                .filter(output => !configuredOutputIds.has(output.id))
                .sort((a, b) => a.name.localeCompare(b.name));
        }),
        [configuredOutputIdSetAtom, outputInfosAtom],
    );
    const outputInfoAtomFamily = useMemo(
        () => atomFamily((outputId: string) => atom((get) => get(outputInfosAtom).find(info => info.id === outputId))),
        [outputInfosAtom],
    );
    const configuredOutputInfoAtomFamily = useMemo(
        () => atomFamily((outputAtom: PrimitiveAtom<Output>) => atom((get) => {
            const outputId = get(outputAtom).id;
            return get(outputInfosAtom).find(info => info.id === outputId);
        })),
        [outputInfosAtom],
    );
    const linkOutputAtom = useMemo(
        () => atom(
            null,
            (get, set, outputId: string) => {
                const current = get(configuredOutputsAtom);
                if (current.some(output => output.id === outputId)) return;
                set(configuredOutputsAtom, produce(current, (draft) => {
                    pushItem(draft, {id: outputId, ...getDefaultOutput(), links: getDefaultLinks()});
                }));
            },
        ),
        [configuredOutputsAtom],
    );
    const [intifaceAddress, setIntifaceAddress] = useAtom(intifaceAddressAtom);
    const [maxLevelParam, setMaxLevelParam] = useAtom(maxLevelParamAtom);
    const [vrcConfigDir, setVrcConfigDir] = useAtom(vrcConfigDirAtom);
    const [oscProxy, setOscProxy] = useAtom(oscProxyAtom);
    const configuredOutputCount = useAtomValue(configuredOutputCountAtom);
    const intifaceConnected = useAtomValue(intifaceConnectedAtom);
    const vrchatConnected = useAtomValue(vrchatConnectedAtom);
    const importedAllDeletesAt = useAtomValue(importedAllDeletesAtAtom);
    const detectedVrcConfigDir = useAtomValue(detectedVrcConfigDirAtom);
    const configuredSortedOutputs = useAtomValue(configuredSortedOutputsAtom);
    const unconfiguredOutputs = useAtomValue(unconfiguredOutputsAtom);
    const setConfiguredOutputs = useSetAtom(configuredOutputsAtom);
    const requestDeleteOutput = useCallback((outputId: string) => {
        setPendingDeleteOutputId(outputId);
    }, [setPendingDeleteOutputId]);
    const cancelDeleteOutput = useCallback(() => {
        setPendingDeleteOutputId(null);
    }, []);
    const confirmDeleteOutput = useCallback(() => {
        if (!pendingDeleteOutputId) return;
        setConfiguredOutputs((configuredOutputs) => produce(configuredOutputs, (draft) => {
            const index = draft.findIndex(output => output.id === pendingDeleteOutputId);
            if (index >= 0) removeAt(draft, index);
        }));
        setPendingDeleteOutputId(null);
    }, [pendingDeleteOutputId, setConfiguredOutputs]);

    let intifaceWarning;
    if (intifaceConnected && configuredOutputCount === 0 && unconfiguredOutputs.length === 0) {
        intifaceWarning = "No devices are connected to Intiface";
    } else {
        intifaceWarning = undefined;
    }

    return (
        <Stack spacing={0}>
            <MyAccordion
                expanded={intifaceExpanded}
                onChange={setIntifaceExpanded}
                summary={
                    <Stack direction="row" spacing={1} alignItems="center">
                        <ConnectionBubble color={intifaceConnected ? intifaceWarning ? 'warning.main' : 'success.main' : 'error.main'} />
                        <Typography variant="h6">Initiface</Typography>
                    </Stack>
                }
            >
                <Stack spacing={2}>
                    {intifaceWarning && (
                        <Alert severity="warning">{intifaceWarning}</Alert>
                    )}
                    <TextCommitInput
                        value={intifaceAddress ?? ''}
                        label="Server Address"
                        placeholder="ws://localhost:12345"
                        onCommit={setIntifaceAddress}
                    />
                </Stack>
            </MyAccordion>

            <MyAccordion
                expanded={vrchatExpanded}
                onChange={setVrchatExpanded}
                summary={
                    <Stack direction="row" spacing={1} alignItems="center">
                        <ConnectionBubble color={vrchatConnected ? 'success.main' : 'error.main'} />
                        <Typography variant="h6">VRChat</Typography>
                    </Stack>
                }
            >
                <Stack spacing={2}>
                    <TextCommitInput
                        value={maxLevelParam ?? ''}
                        label="Send Max Level to Avatar Controller Parameter"
                        placeholder="Parameter Name"
                        onCommit={setMaxLevelParam}
                    />
                    <TextCommitInput
                        value={vrcConfigDir ?? ''}
                        label="VRChat Config Directory"
                        placeholder="Auto-detected"
                        helperText={`Detected: ${detectedVrcConfigDir ?? 'Not found'}`}
                        onCommit={setVrcConfigDir}
                    />
                    <Stack spacing={1.25}>
                        <Typography variant="subtitle2">OSC Proxy</Typography>
                        {oscProxy.length === 0 && (
                            <TextField
                                size="small"
                                fullWidth
                                spellCheck={false}
                                value=""
                                placeholder="No proxy targets configured."
                                disabled
                            />
                        )}
                        {oscProxy.map((port, index) => (
                            <TextCommitInput
                                key={index}
                                label={`Target ${index + 1}`}
                                value={port}
                                placeholder="ip:port"
                                onCommit={value => {
                                    setOscProxy(produce(oscProxy, draft => replaceAt(draft, index, value)));
                                }}
                                endAdornment={
                                    <InputAdornment position="end">
                                        <IconButton
                                            color="error"
                                            aria-label={`Remove target ${index + 1}`}
                                            onClick={() => setOscProxy(produce(oscProxy, draft => removeAt(draft, index)))}
                                            edge="end"
                                            size="small"
                                            sx={{
                                                width: 28,
                                                height: 28,
                                                borderRadius: '50%',
                                            }}
                                        >
                                            <CloseIcon fontSize="small" />
                                        </IconButton>
                                    </InputAdornment>
                                }
                            />
                        ))}
                        <Box>
                            <Button
                                variant="outlined"
                                sx={{textTransform: 'none'}}
                                onClick={() => setOscProxy(produce(oscProxy, draft => pushItem(draft, '')))}
                            >
                                Add target
                            </Button>
                        </Box>
                    </Stack>
                </Stack>
            </MyAccordion>

            {configuredSortedOutputs.map((outputAtom) => {
                return (
                    <ConfiguredOutputRow
                        key={outputAtom.toString()}
                        outputAtom={outputAtom}
                        infoAtom={configuredOutputInfoAtomFamily(outputAtom)}
                        importedAllDeletesAt={importedAllDeletesAt}
                        onDelete={requestDeleteOutput}
                    />
                );
            })}

            {unconfiguredOutputs.map((output) => (
                <UnconfiguredOutputRow
                    key={output.id}
                    outputAtom={outputInfoAtomFamily(output.id)}
                    linkOutputAtom={linkOutputAtom}
                />
            ))}

            <Dialog
                open={pendingDeleteOutputId !== null}
                onClose={cancelDeleteOutput}
                aria-labelledby="unlink-output-title"
                aria-describedby="unlink-output-description"
            >
                <DialogTitle id="unlink-output-title">Remove device?</DialogTitle>
                <DialogContent>
                    <DialogContentText id="unlink-output-description">
                        The configuration will be completely deleted. You can link it again later.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={cancelDeleteOutput}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={confirmDeleteOutput}>Remove</Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}

export default React.memo(SettingsBody);
