import React from "react";
import {Alert, Box, Button, IconButton, InputAdornment, Stack, TextField, Typography} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import {pushItem, removeAt, replaceAt} from "../../../common/arrayDraft";
import {OscStatus, OscqueryStatus} from "../../../common/ipcContract";
import {produce} from "immer";
import TextCommitInput from "../util/TextCommitInput";
import MyAccordion from "../util/MyAccordion";
import ConnectionBubble from "./ConnectionBubble";

interface Props {
    expanded: boolean;
    onChange: (expanded: boolean) => void;
    vrchatConnected: boolean;
    hasVrchatWarnings: boolean;
    vrchatWarning: boolean;
    outdatedAvatarDetected: boolean;
    vrchatOscEnabledWarning: boolean;
    vrchatSelfInteractWarning: boolean;
    vrchatEveryoneInteractWarning: boolean;
    vrchatOscStartupWarning: boolean;
    vrchatOscStartupWarningText?: string;
    vrchatLogsFound: boolean;
    oscqueryStatus: OscqueryStatus;
    oscStatus: OscStatus;
    mdnsWorking: boolean;
    maxLevelParam: string;
    onMaxLevelParamCommit: (value: string) => void;
    vrcConfigDir: string;
    detectedVrcConfigDir?: string;
    onVrcConfigDirCommit: (value: string) => void;
    oscProxy: string[];
    onSetOscProxy: (next: string[]) => void;
}

const oscqueryWarningTextByStatus: Record<Exclude<OscqueryStatus, 'success' | 'searching'>, string> = {
    waitingForBulk: "Waiting for OSCQuery bulk sync for the current avatar.",
    failedToConnectHttpServer: "Could not connect to VRChat OSCQuery HTTP server.",
    vrchatOscqueryBroadcastNotFound: "VRChat OSCQuery broadcast has not been found yet.",
    unknownError: "Unknown OSCQuery scan error occurred.",
};

const oscWarningTextByStatus: Record<Exclude<OscStatus, 'connected'>, string> = {
    socketStarting: "OSC socket is starting...",
    waitingForFirstPacket: "VRChat has not yet sent an OSC packet to OGB. Either the game is closed, OSC is disabled, OSCQuery isn't working, or something is broken.",
    stale: "VRChat stopped sending OSC packets. Either the game is closed, OSC is disabled, or something is broken.",
};

function VrchatSettingsSection({
    expanded,
    onChange,
    vrchatConnected,
    hasVrchatWarnings,
    vrchatWarning,
    outdatedAvatarDetected,
    vrchatOscEnabledWarning,
    vrchatSelfInteractWarning,
    vrchatEveryoneInteractWarning,
    vrchatOscStartupWarning,
    vrchatOscStartupWarningText,
    vrchatLogsFound,
    oscqueryStatus,
    oscStatus,
    mdnsWorking,
    maxLevelParam,
    onMaxLevelParamCommit,
    vrcConfigDir,
    detectedVrcConfigDir,
    onVrcConfigDirCommit,
    oscProxy,
    onSetOscProxy,
}: Props) {
    return (
        <MyAccordion
            expanded={expanded}
            onChange={onChange}
            summary={
                <Stack direction="row" spacing={1} alignItems="center">
                    <ConnectionBubble color={vrchatConnected ? (hasVrchatWarnings ? 'warning.main' : 'success.main') : 'error.main'} />
                    <Typography variant="h6">VRChat</Typography>
                </Stack>
            }
        >
            <Stack spacing={2}>
                {vrchatWarning && (
                    <Alert severity="warning">
                        Your current avatar contains no SPS zones. If this is unexpected, make sure you've added SPS sockets or an
                        SPS-compatible prefab to the avatar in unity. If your avatar has DPS, you can upgrade it using the{' '}
                        <a href="https://osc.toys/avatar" target="_blank" rel="noreferrer">VRCFury Haptic Upgrade tool</a>.
                    </Alert>
                )}
                {outdatedAvatarDetected && (
                    <Alert severity="warning">
                        Your avatar appears to be using an outdated VRCFury Haptics build. Penetration may not work correctly or may be less effective.
                    </Alert>
                )}
                {vrchatOscEnabledWarning && (
                    <Alert severity="warning">
                        OSC is disabled in your game. Enable it in the radial menu: Options &gt; OSC &gt; Enabled.
                    </Alert>
                )}
                {vrchatSelfInteractWarning && (
                    <Alert severity="warning">
                        Self-Interaction is disabled in your game. Enable it in the quick menu: Settings &gt; Avatar Interactions &gt; Self Interact.
                    </Alert>
                )}
                {vrchatEveryoneInteractWarning && (
                    <Alert severity="warning">
                        Interaction is not set to everyone in game. Enable it in the quick menu: Settings &gt; Avatar Interactions &gt; Everyone.
                    </Alert>
                )}
                {vrchatOscStartupWarning && (
                    <Alert severity="warning">
                        VRChat log indicates OSC failed to start: {vrchatOscStartupWarningText ?? 'Unknown reason'}.
                    </Alert>
                )}
                {!vrchatLogsFound && (
                    <Alert severity="warning">
                        Couldn't find the VRChat log files. This can result in delayed initial connection, or complete failure if mDns is not available.
                    </Alert>
                )}
                {oscqueryStatus !== 'success' && oscqueryStatus !== 'searching' && (
                    <Alert severity="warning">{oscqueryWarningTextByStatus[oscqueryStatus]}</Alert>
                )}
                {oscStatus !== 'connected' && (
                    <Alert severity="warning">{oscWarningTextByStatus[oscStatus]}</Alert>
                )}
                {!mdnsWorking && (
                    <Alert severity="warning">
                        mDNS appears unavailable on this system, so OGB cannot use OSCQuery. OGB can still run, but only one VRChat OSC app can be active at a time.
                    </Alert>
                )}
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
                    helperText={`Detected: ${detectedVrcConfigDir ?? 'Not found'}`}
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
