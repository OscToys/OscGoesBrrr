import React, {ReactNode} from "react";
import {Alert, AlertColor, Box, Button, IconButton, InputAdornment, Stack, TextField, Typography} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import {pushItem, removeAt, replaceAt} from "../../../common/arrayDraft";
import {SettingsStateVrchat} from "../../../common/ipcContract";
import {produce} from "immer";
import TextCommitInput from "../util/TextCommitInput";
import MyAccordion from "../util/MyAccordion";
import ConnectionBubble from "./ConnectionBubble";
import {type PrimitiveAtom, useAtomValue} from "jotai";
import {getConnectionBubbleColor} from "../../utils/connectionBubbleColor";

interface Props {
    expanded: boolean;
    onChange: (expanded: boolean) => void;
    vrchatAtom: PrimitiveAtom<SettingsStateVrchat>;
    maxLevelParam: string;
    onMaxLevelParamCommit: (value: string) => void;
    vrcConfigDir: string;
    onVrcConfigDirCommit: (value: string) => void;
    oscProxy: string[];
    onSetOscProxy: (next: string[]) => void;
}

function VrchatSettingsSection({
    expanded,
    onChange,
    vrchatAtom,
    maxLevelParam,
    onMaxLevelParamCommit,
    vrcConfigDir,
    onVrcConfigDirCommit,
    oscProxy,
    onSetOscProxy,
}: Props) {
    const vrchat = useAtomValue(vrchatAtom);
    const alerts: {severity: AlertColor; content: ReactNode}[] = [];

    if (vrchat.connected && !vrchat.warnings.hasSpsZones) {
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
    if (vrchat.warnings.outdatedAvatarDetected) {
        alerts.push({
            severity: "warning",
            content: "Your current avatar was created using an outdated version of SPS. Features may not work correctly or may be less effective.",
        });
    }
    if (vrchat.warnings.oscEnabled) {
        alerts.push({
            severity: "error",
            content: "OSC is disabled in the in-game settings. This setting must be enabled. Enable it in the radial menu: Options > OSC > Enabled.",
        });
    }
    if (vrchat.warnings.selfInteract) {
        alerts.push({
            severity: "error",
            content: "Self-Interaction is disabled in the in-game settings. This setting must be enabled. Enable it in the quick menu: Settings > Avatar Interactions > Self Interact.",
        });
    }
    if (vrchat.warnings.everyoneInteract) {
        alerts.push({
            severity: "warning",
            content: "Interaction is not set to 'Everyone' in the in-game settings. You will not be able to interact with most players. Enable it in the quick menu: Settings > Avatar Interactions > Everyone.",
        });
    }
    if (vrchat.warnings.oscStartup) {
        alerts.push({
            severity: "error",
            content: `VRChat's logs indicate that its OSC failed to start: ${vrchat.warnings.oscStartupText ?? 'Unknown reason'}.`,
        });
    }
    if (!vrchat.warnings.logsFound) {
        alerts.push({
            severity: "warning",
            content: "Could not find the VRChat log files. This can result in delayed initial connection, or complete failure if mDNS is not available.",
        });
    }

    if (vrchat.warnings.oscqueryStatus === 'failedToConnectHttpServer') {
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
    } else if (vrchat.warnings.oscqueryStatus === 'vrchatOscqueryBroadcastNotFound') {
        alerts.push({
            severity: "error",
            content: "VRChat OSCQuery broadcast has not been found yet.",
        });
    } else if (vrchat.warnings.oscqueryStatus === 'unknownError') {
        alerts.push({
            severity: "error",
            content: "Unknown OSCQuery scan error occurred.",
        });
    } else if (vrchat.warnings.oscStatus === 'socketStarting') {
        alerts.push({
            severity: "error",
            content: "OSC socket is starting...",
        });
    } else if (vrchat.warnings.oscStatus === 'waitingForFirstPacket') {
        alerts.push({
            severity: "error",
            content: (
                <>
                    VRChat has not yet sent an OSC packet to OGB. Either:
                    <Box component="ul" sx={{m: 0, pl: 3}}>
                        <Typography component="li" variant="body2">VRChat is closed</Typography>
                        <Typography component="li" variant="body2">OSC is disabled in the in-game options</Typography>
                        <Typography component="li" variant="body2">OSCQuery isn't working or something else is broken</Typography>
                    </Box>
                </>
            ),
        });
    } else if (vrchat.warnings.oscStatus === 'stale') {
        alerts.push({
            severity: "error",
            content: (
                <>
                    VRChat stopped sending OSC packets. Either:
                    <Box component="ul" sx={{m: 0, pl: 3}}>
                        <Typography component="li" variant="body2">The game is closed</Typography>
                        <Typography component="li" variant="body2">OSC is disabled in the in-game options</Typography>
                        <Typography component="li" variant="body2">Something else is broken</Typography>
                    </Box>
                </>
            ),
        });
    }

    if (!vrchat.warnings.mdnsWorking) {
        alerts.push({
            severity: "warning",
            content: "OSCQuery is disabled because mDNS does not work on this PC. This means you cannot use any other OSC apps at the same time.",
        });
    }

    if (!vrchat.connected && !alerts.some((alert) => alert.severity === "error")) {
        alerts.push({
            severity: "error",
            content: "VRChat is disconnected."
        });
    }

    const connectionColor = getConnectionBubbleColor(alerts);

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

                <TextCommitInput
                    value={maxLevelParam}
                    label="Send Max Level to Avatar Controller Parameter"
                    placeholder="Parameter Name"
                    onCommit={onMaxLevelParamCommit}
                />
                <TextCommitInput
                    value={vrcConfigDir}
                    label="VRChat Config Directory"
                    placeholder="Auto-detected"
                    helperText={`Detected: ${vrchat.detectedVrcConfigDir ?? 'Not found'}`}
                    onCommit={onVrcConfigDirCommit}
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
                                onSetOscProxy(produce(oscProxy, draft => replaceAt(draft, index, value)));
                            }}
                            endAdornment={
                                <InputAdornment position="end">
                                    <IconButton
                                        color="error"
                                        aria-label={`Remove target ${index + 1}`}
                                        onClick={() => onSetOscProxy(produce(oscProxy, draft => removeAt(draft, index)))}
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
                            onClick={() => onSetOscProxy(produce(oscProxy, draft => pushItem(draft, '')))}
                        >
                            Add target
                        </Button>
                    </Box>
                </Stack>
            </Stack>
        </MyAccordion>
    );
}

export default React.memo(VrchatSettingsSection);
