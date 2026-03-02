import React, {useState} from 'react';
import {produce} from 'immer';
import {Config, getDefaultLinks, getDefaultOutput, Output} from '../../../common/configTypes';
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

interface Props {
    config: Config;
    settingsState: SettingsStatePayload;
    onCommitConfig: (nextConfig: Config) => void;
}

export default function SettingsBody({
    config,
    settingsState,
    onCommitConfig,
}: Props) {
    const {
        outputs: allOutputs,
        intifaceConnected,
        vrchatConnected,
        importedAllDeletesAt,
        detectedVrcConfigDir,
    } = settingsState;
    const [intifaceExpanded, setIntifaceExpanded] = useState(false);
    const [vrchatExpanded, setVrchatExpanded] = useState(false);
    const [pendingDeleteOutputId, setPendingDeleteOutputId] = useState<string | null>(null);

    const confirmDeleteOutput = () => {
        if (!pendingDeleteOutputId) return;
        onCommitConfig(produce(config, (draft) => {
            const index = draft.outputs.findIndex(output => output.id === pendingDeleteOutputId);
            if (index >= 0) removeAt(draft.outputs, index);
        }));
        setPendingDeleteOutputId(null);
    };

    const cancelDeleteOutput = () => {
        setPendingDeleteOutputId(null);
    };

    const configuredOutputs = config.outputs;
    const getOutputInfo = (id?: string) => id ? allOutputs.find(t => t.id === id) : undefined;
    const configuredOutputIdSet = new Set(configuredOutputs.map(output => output.id));
    const unconfiguredOutputs = allOutputs
        .filter(output => output.connected)
        .filter(output => !configuredOutputIdSet.has(output.id))
        .sort((a, b) => {
            return a.name.localeCompare(b.name);
        });

    const linkOutput = (outputId: string) => {
        if (configuredOutputIdSet.has(outputId)) return;
        const linkedOutput: Output = {id: outputId, ...getDefaultOutput(), links: getDefaultLinks()};
        onCommitConfig(produce(config, (draft) => pushItem(draft.outputs, linkedOutput)));
    };

    const updateConfiguredOutput = (index: number, newOutput: Output) => {
        onCommitConfig(produce(config, (draft) => replaceAt(draft.outputs, index, newOutput)));
    };

    let intifaceWarning;
    if (intifaceConnected && configuredOutputs.length === 0 && unconfiguredOutputs.length === 0) {
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
                        value={config.intifaceAddress ?? ''}
                        label="Server Address"
                        placeholder="ws://localhost:12345"
                        onCommit={value => onCommitConfig(produce(config, (draft) => {
                            const next = value.trim() ? value : undefined;
                            if (next === undefined) delete draft.intifaceAddress;
                            else draft.intifaceAddress = next;
                        }))}
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
                        value={config.maxLevelParam ?? ''}
                        label="Send Max Level to Avatar Controller Parameter"
                        placeholder="Parameter Name"
                        onCommit={value => onCommitConfig(produce(config, (draft) => {
                            draft.maxLevelParam = value;
                        }))}
                    />
                    <TextCommitInput
                        value={config.vrcConfigDir ?? ''}
                        label="VRChat Config Directory"
                        placeholder="Auto-detected"
                        helperText={`Detected: ${detectedVrcConfigDir ?? 'Not found'}`}
                        onCommit={value => onCommitConfig(produce(config, (draft) => {
                            draft.vrcConfigDir = value;
                        }))}
                    />
                    <Stack spacing={1.25}>
                        <Typography variant="subtitle2">OSC Proxy</Typography>
                        {config.oscProxy.length === 0 && (
                            <TextField
                                size="small"
                                fullWidth
                                spellCheck={false}
                                value=""
                                placeholder="No proxy targets configured."
                                disabled
                            />
                        )}
                        {config.oscProxy.map((port, index) => (
                            <TextCommitInput
                                key={index}
                                label={`Target ${index + 1}`}
                                value={port}
                                placeholder="ip:port"
                                onCommit={value => {
                                    const next = value.trim();
                                    onCommitConfig(produce(config, (draft) => replaceAt(draft.oscProxy, index, next)));
                                }}
                                endAdornment={
                                    <InputAdornment position="end">
                                        <IconButton
                                            color="error"
                                            aria-label={`Remove target ${index + 1}`}
                                            onClick={() => onCommitConfig(produce(config, (draft) => removeAt(draft.oscProxy, index)))}
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
                                onClick={() => onCommitConfig(produce(config, (draft) => pushItem(draft.oscProxy, '')))}
                            >
                                Add target
                            </Button>
                        </Box>
                    </Stack>
                </Stack>
            </MyAccordion>

            {configuredOutputs.map((output, index) => {
                const info = getOutputInfo(output.id);
                return {output, index, info};
            })
                .sort((a, b) => {
                    const aConnected = Boolean(a.info?.connected);
                    const bConnected = Boolean(b.info?.connected);
                    if (aConnected === bConnected) return 0;
                    return aConnected ? -1 : 1;
                })
                .map(({output, index, info}) => (
                    <ConfiguredOutputRow
                        key={output.id}
                        output={output}
                        index={index}
                        info={info}
                        importedAllDeletesAt={importedAllDeletesAt}
                        onChange={updateConfiguredOutput}
                        onDelete={setPendingDeleteOutputId}
                    />
                ))
            }

            {unconfiguredOutputs.map((output) => (
                <UnconfiguredOutputRow key={output.id} output={output} onLink={linkOutput} />
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
