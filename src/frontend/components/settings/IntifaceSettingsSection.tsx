import React from "react";
import {Alert, AlertColor, Box, Checkbox, FormControlLabel, Stack, Typography} from "@mui/material";
import TextCommitInput from "../util/TextCommitInput";
import MyAccordion from "../util/MyAccordion";
import ConnectionBubble from "./ConnectionBubble";
import {getConnectionBubbleColor} from "../../utils/connectionBubbleColor";
import {useSettingsStateAtom} from "./SettingsStateAtomContext";
import {type PrimitiveAtom, useAtom, useAtomValue} from "jotai";
import {selectAtom} from "jotai/utils";

interface Props {
    expanded: boolean;
    onChange: (expanded: boolean) => void;
    intifaceAddressAtom: PrimitiveAtom<string | undefined>;
    useIntifaceMdnsAtom: PrimitiveAtom<boolean>;
}

function IntifaceSettingsSection({
    expanded,
    onChange,
    intifaceAddressAtom,
    useIntifaceMdnsAtom,
}: Props) {
    const settingsStateAtom = useSettingsStateAtom();
    const intifaceConnected = useAtomValue(
        React.useMemo(() => selectAtom(settingsStateAtom, (state) => state.intifaceConnected), [settingsStateAtom]),
    );
    const intifaceAddressOffSubnet = useAtomValue(
        React.useMemo(() => selectAtom(settingsStateAtom, (state) => state.intifaceAddressOffSubnet), [settingsStateAtom]),
    );
    const intifaceConnectedAddress = useAtomValue(
        React.useMemo(() => selectAtom(settingsStateAtom, (state) => state.intifaceConnectedAddress), [settingsStateAtom]),
    );
    const outputs = useAtomValue(
        React.useMemo(() => selectAtom(settingsStateAtom, (state) => state.outputs), [settingsStateAtom]),
    );
    const [intifaceAddress, setIntifaceAddress] = useAtom(intifaceAddressAtom);
    const [useIntifaceMdns, setUseIntifaceMdns] = useAtom(useIntifaceMdnsAtom);
    const alerts: {severity: AlertColor; content: React.ReactNode}[] = [];
    if (!intifaceConnected) {
        if (!useIntifaceMdns && intifaceAddress !== undefined && intifaceAddressOffSubnet) {
            alerts.push({
                severity: "error",
                content: "The IP you entered is not on your local network. Make sure the device is on wifi, connected to the same router, and not using a VPN.",
            });
        } else {
            alerts.push({
                severity: "error",
                content: useIntifaceMdns ? (
                    <Stack spacing={0.5}>
                        <div>Intiface is not connected.</div>
                    </Stack>
                ) : "Intiface is not connected.",
            });
        }
    } else if (!outputs.some((output) => output.connected)) {
        alerts.push({severity: "warning", content: "No devices are connected to Intiface"});
    }

    return (
        <MyAccordion
            expanded={expanded}
            onChange={onChange}
            summary={
                <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}>
                    <ConnectionBubble color={getConnectionBubbleColor(alerts)} />
                    <Typography variant="h6">Intiface</Typography>
                </Stack>
            }
        >
            <Stack spacing={2}>
                {alerts.map((alert, index) => (
                    <Alert key={index} severity={alert.severity}>{alert.content}</Alert>
                ))}
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={useIntifaceMdns}
                            onChange={(_, checked) => setUseIntifaceMdns(checked)}
                        />
                    }
                    label={
                        <Stack spacing={0}>
                            <Typography>Use mDNS</Typography>
                            <Typography variant="caption">
                                In the Intiface App's "App Modes" tab, you must enable "Show Advanced/Experimental Settings" and "Broadcast Service Info via mDNS"
                            </Typography>
                        </Stack>
                    }
                />
                <TextCommitInput
                    value={useIntifaceMdns ? intifaceConnectedAddress ?? 'Searching ...' : intifaceAddress ?? ''}
                    label="Server Address"
                    placeholder="ws://localhost:12345"
                    disabled={useIntifaceMdns}
                    onCommit={setIntifaceAddress}
                />
            </Stack>
        </MyAccordion>
    );
}

export default React.memo(IntifaceSettingsSection);
