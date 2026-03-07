import React from "react";
import {Alert, AlertColor, Stack, Typography} from "@mui/material";
import TextCommitInput from "../util/TextCommitInput";
import MyAccordion from "../util/MyAccordion";
import ConnectionBubble from "./ConnectionBubble";
import {getConnectionBubbleColor} from "../../utils/connectionBubbleColor";
import {useSettingsStateAtom} from "./SettingsStateAtomContext";
import {useAtomValue} from "jotai";
import {selectAtom} from "jotai/utils";

interface Props {
    expanded: boolean;
    onChange: (expanded: boolean) => void;
    intifaceAddress: string;
    onIntifaceAddressCommit: (value: string) => void;
}

function IntifaceSettingsSection({
    expanded,
    onChange,
    intifaceAddress,
    onIntifaceAddressCommit,
}: Props) {
    const settingsStateAtom = useSettingsStateAtom();
    const intifaceConnected = useAtomValue(
        React.useMemo(() => selectAtom(settingsStateAtom, (state) => state.intifaceConnected), [settingsStateAtom]),
    );
    const outputs = useAtomValue(
        React.useMemo(() => selectAtom(settingsStateAtom, (state) => state.outputs), [settingsStateAtom]),
    );
    const alerts: {severity: AlertColor; content: string}[] = [];
    if (intifaceConnected && !outputs.some((output) => output.connected)) {
        alerts.push({severity: "warning", content: "No devices are connected to Intiface"});
    }
    if (!intifaceConnected && !alerts.some((alert) => alert.severity === "error")) {
        alerts.push({severity: "error", content: "Intiface is not connected."});
    }

    return (
        <MyAccordion
            expanded={expanded}
            onChange={onChange}
            summary={
                <Stack direction="row" spacing={1} alignItems="center">
                    <ConnectionBubble color={getConnectionBubbleColor(alerts)} />
                    <Typography variant="h6">Initiface</Typography>
                </Stack>
            }
        >
            <Stack spacing={2}>
                {alerts.map((alert, index) => (
                    <Alert key={index} severity={alert.severity}>{alert.content}</Alert>
                ))}
                <TextCommitInput
                    value={intifaceAddress}
                    label="Server Address"
                    placeholder="ws://localhost:12345"
                    onCommit={onIntifaceAddressCommit}
                />
            </Stack>
        </MyAccordion>
    );
}

export default React.memo(IntifaceSettingsSection);
