import React, {ReactNode} from "react";
import {Alert, AlertColor, Box, Button, FormControl, FormControlLabel, FormHelperText, IconButton, InputAdornment, Stack, Switch, TextField, Typography} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import {pushItem, removeAt, replaceAt} from "../../../common/arrayDraft";
import {produce} from "immer";
import TextCommitInput from "../util/TextCommitInput";
import MyAccordion from "../util/MyAccordion";
import NotchedBox from "../util/NotchedBox";
import ConnectionBubble from "./ConnectionBubble";
import {type PrimitiveAtom, useAtom, useAtomValue} from "jotai";
import {getConnectionBubbleColor} from "../../utils/connectionBubbleColor";
import {useSettingsStateAtom} from "./SettingsStateAtomContext";
import {selectAtom} from "jotai/utils";

interface Props {
    expanded: boolean;
    onChange: (expanded: boolean) => void;
    useOscQueryAtom: PrimitiveAtom<boolean>;
    maxLevelParamAtom: PrimitiveAtom<string | undefined>;
    vrcConfigDirAtom: PrimitiveAtom<string | undefined>;
    oscProxyAtom: PrimitiveAtom<string[]>;
}

function VrchatSettingsSection({
    expanded,
    onChange,
    useOscQueryAtom,
    maxLevelParamAtom,
    vrcConfigDirAtom,
    oscProxyAtom,
}: Props) {
    const [advancedExpanded, setAdvancedExpanded] = React.useState(false);
    const [diagnosticsExpanded, setDiagnosticsExpanded] = React.useState(false);
    const settingsStateAtom = useSettingsStateAtom();
    const vrchatAtom = React.useMemo(() => selectAtom(settingsStateAtom, (state) => state.vrchat), [settingsStateAtom]);
    const [useOscQuery, setUseOscQuery] = useAtom(useOscQueryAtom);
    const [maxLevelParam, setMaxLevelParam] = useAtom(maxLevelParamAtom);
    const [vrcConfigDir, setVrcConfigDir] = useAtom(vrcConfigDirAtom);
    const [oscProxy, setOscProxy] = useAtom(oscProxyAtom);
    const vrchat = useAtomValue(vrchatAtom);
    const alerts: {severity: AlertColor; content: ReactNode}[] = [];

    if (vrchat.connected && !vrchat.diagnostics.hasSpsZones) {
        alerts.push({
            severity: "warning",
            content: (
                <>
                    Your current avatar contains no SPS zones. If this is unexpected, make sure you've added SPS sockets or an
                    SPS-compatible prefab to the avatar in unity. If your avatar has old DPS, you can upgrade it to SPS using the{" "}
                    <a href="https://osc.toys/avatar" target="_blank" rel="noreferrer">VRCFury Haptic Upgrade tool</a>.
                </>
            ),
        });
    }
    if (vrchat.diagnostics.outdatedAvatarDetected) {
        alerts.push({
            severity: "warning",
            content: "Your current avatar was created using an outdated version of SPS. Features may not work correctly or may be less effective.",
        });
    }
    if (vrchat.diagnostics.oscEnabled) {
        alerts.push({
            severity: "error",
            content: "OSC is disabled in the in-game settings. This setting must be enabled. Enable it in the radial menu: Options > OSC > Enabled.",
        });
    }
    if (vrchat.diagnostics.selfInteract) {
        alerts.push({
            severity: "error",
            content: "Self-Interaction is disabled in the in-game settings. This setting must be enabled. Enable it in the quick menu: Settings > Avatar Interactions > Self Interact.",
        });
    }
    if (vrchat.diagnostics.everyoneInteract) {
        alerts.push({
            severity: "warning",
            content: "Interaction is not set to 'Everyone' in the in-game settings. You will not be able to interact with most players. Enable it in the quick menu: Settings > Avatar Interactions > Everyone.",
        });
    }
    if (vrchat.diagnostics.oscStartup) {
        alerts.push({
            severity: "error",
            content: `VRChat's logs indicate that its OSC failed to start: ${vrchat.diagnostics.oscStartupText ?? 'Unknown reason'}.`,
        });
    }
    if (!vrchat.diagnostics.logsFound) {
        alerts.push({
            severity: "warning",
            content: "Could not find the VRChat log files. This can result in delayed initial connection, or complete failure if mDNS is not available.",
        });
    }

    if (vrchat.diagnostics.oscqueryStatus === 'failedToConnectHttpServer') {
        alerts.push({
            severity: "error",
            content: (
                <>
                    Could not connect to VRChat OSCQuery HTTP server. Either:
                    <Box component="ul" sx={{m: 0, pl: 3}}>
                        <Typography component="li" variant="body2">The game is closed</Typography>
                        <Typography component="li" variant="body2">OSC is disabled in the in-game options</Typography>
                        <Typography component="li" variant="body2">Something else is broken</Typography>
                    </Box>
                </>
            ),
        });
    } else if (vrchat.diagnostics.oscqueryStatus === 'vrchatOscqueryBroadcastNotFound') {
        alerts.push({
            severity: "error",
            content: "VRChat OSCQuery broadcast has not been found yet.",
        });
    } else if (vrchat.diagnostics.oscqueryStatus === 'unknownError') {
        alerts.push({
            severity: "error",
            content: "Unknown OSCQuery scan error occurred.",
        });
    } else if (vrchat.diagnostics.oscStatus === 'socketStarting') {
        alerts.push({
            severity: "error",
            content: "OSC socket is starting...",
        });
    } else if (vrchat.diagnostics.oscStatus === 'waitingForFirstPacket') {
        alerts.push({
            severity: "error",
            content: (
                <>
                    VRChat has not yet sent an OSC packet to OGB. Either:
                    <Box component="ul" sx={{m: 0, pl: 3}}>
                        <Typography component="li" variant="body2">VRChat is closed</Typography>
                        <Typography component="li" variant="body2">You haven't moved in game and your avatar has no changing parameters</Typography>
                        <Typography component="li" variant="body2">OSC is disabled in the in-game options</Typography>
                        <Typography component="li" variant="body2">OSCQuery isn't working or something else is broken</Typography>
                    </Box>
                </>
            ),
        });
    } else if (vrchat.diagnostics.oscStatus === 'stale') {
        alerts.push({
            severity: "error",
            content: (
                <>
                    VRChat stopped sending OSC packets. Either:
                    <Box component="ul" sx={{m: 0, pl: 3}}>
                        <Typography component="li" variant="body2">The game is closed</Typography>
                        <Typography component="li" variant="body2">You aren't moving in game and your avatar has no changing parameters</Typography>
                        <Typography component="li" variant="body2">You just disabled OSC in the in-game options</Typography>
                        <Typography component="li" variant="body2">Something else is broken</Typography>
                    </Box>
                </>
            ),
        });
    }

    if (!vrchat.connected && !alerts.some((alert) => alert.severity === "error")) {
        alerts.push({
            severity: "error",
            content: "VRChat is disconnected."
        });
    }

    const connectionColor = getConnectionBubbleColor(alerts);
    const diagnosticsText = [
        `OGB OSC: ${vrchat.diagnostics.ogbOscPort ?? "n/a"}`,
        `OGB OSCQ: ${vrchat.diagnostics.ogbOscqueryPort ?? "n/a"}`,
        `OGB OSC status: ${vrchat.diagnostics.oscStatus}`,
        `OGB bulk: ${vrchat.diagnostics.oscqueryWaitingForBulk ? "waiting" : "ready"}`,
        `VRC OSCQ: ${vrchat.diagnostics.vrcOscqueryPort ?? "n/a"}`,
        `VRC OSC: ${vrchat.diagnostics.vrcOscPort ?? "n/a"}`,
        `VRC OSCQ status: ${vrchat.diagnostics.oscqueryStatus}`,
        `Logs: ${vrchat.diagnostics.logsFound ? "found" : "missing"}`,
        `Detected: ${vrchat.diagnostics.detectedVrcConfigDir ?? "not found"}`,
    ].join(" | ");

    return (
        <MyAccordion
            expanded={expanded}
            onChange={onChange}
            summary={
                <Stack direction="row" spacing={1} alignItems="center">
                    <ConnectionBubble color={connectionColor} />
                    <Typography variant="h6">VRChat</Typography>
                </Stack>
            }
        >
            <Stack spacing={2}>
                {alerts.map((alert, index) => (
                    <Alert key={index} severity={alert.severity}>
                        {alert.content}
                    </Alert>
                ))}

                <Stack spacing={0}>
                    <MyAccordion
                        expanded={advancedExpanded}
                        onChange={setAdvancedExpanded}
                        sx={{bgcolor: 'action.hover'}}
                        summary={
                            <Stack spacing={0.25}>
                                <Typography variant="subtitle2">Advanced VRChat Settings</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    These do not need modified for most installations -- Use the defaults!
                                </Typography>
                            </Stack>
                        }
                    >
                        <Stack spacing={2}>
                            <NotchedBox label="Use OSCQuery (Reduces conflicts with other OSC apps, but doesn't work on all systems)">
                                <Switch
                                    checked={useOscQuery}
                                    onChange={(_, checked) => setUseOscQuery(checked)}
                                />
                            </NotchedBox>
                            <TextCommitInput
                                value={maxLevelParam ?? ''}
                                label="Expose Max Level as an Avatar Parameter (Unusual)"
                                placeholder="Parameter Name"
                                onCommit={setMaxLevelParam}
                            />
                            <TextCommitInput
                                value={vrcConfigDir ?? ''}
                                label="VRChat Config Directory"
                                placeholder="Auto-detected"
                                onCommit={setVrcConfigDir}
                            />
                            <NotchedBox label="OSC Proxy">
                                <Stack spacing={1.25}>
                                    <Typography variant="caption" color="text.secondary">
                                        Proxy raw OSC data to another port, for other apps that do not support OSCQuery
                                    </Typography>
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
                            </NotchedBox>
                        </Stack>
                    </MyAccordion>
                    <MyAccordion
                        expanded={diagnosticsExpanded}
                        onChange={setDiagnosticsExpanded}
                        sx={{bgcolor: 'action.hover'}}
                        summary={<Typography variant="subtitle2">Diagnostics</Typography>}
                    >
                        <Typography variant="caption" color="text.secondary">
                            {diagnosticsText}
                        </Typography>
                    </MyAccordion>
                </Stack>
            </Stack>
        </MyAccordion>
    );
}

export default React.memo(VrchatSettingsSection);
