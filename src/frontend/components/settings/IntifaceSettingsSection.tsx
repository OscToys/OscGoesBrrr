import React from "react";
import {Alert, AlertColor, FormControlLabel, Radio, RadioGroup, Stack, Typography} from "@mui/material";
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
}

function IntifaceSettingsSection({
    expanded,
    onChange,
    intifaceAddressAtom,
}: Props) {
    const settingsStateAtom = useSettingsStateAtom();
    const intifaceConnected = useAtomValue(
        React.useMemo(() => selectAtom(settingsStateAtom, (state) => state.intifaceConnected), [settingsStateAtom]),
    );
    const detectedIntifaceAddresses = useAtomValue(
        React.useMemo(() => selectAtom(settingsStateAtom, (state) => state.detectedIntifaceAddresses), [settingsStateAtom]),
    );
    const outputs = useAtomValue(
        React.useMemo(() => selectAtom(settingsStateAtom, (state) => state.outputs), [settingsStateAtom]),
    );
    const [intifaceAddress, setIntifaceAddress] = useAtom(intifaceAddressAtom);
    const alerts: {severity: AlertColor; content: string}[] = [];
    if (!intifaceConnected) {
        alerts.push({severity: "error", content: "Intiface is not connected."});
    } else if (!outputs.some((output) => output.connected)) {
        alerts.push({severity: "warning", content: "No devices are connected to Intiface"});
    }
    const autoLabel = intifaceAddress === undefined
        ? `Auto (Local / mDNS) - Detected: ${detectedIntifaceAddresses.length > 0 ? detectedIntifaceAddresses.join(", ") : 'Not found'}`
        : 'Auto (Local / mDNS)';

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
                <RadioGroup
                    value={intifaceAddress === undefined ? 'auto' : 'fixed'}
                    onChange={(_event, value) => {
                        if (value === 'auto') {
                            setIntifaceAddress(undefined);
                            return;
                        }
                        setIntifaceAddress('ws://localhost:12345');
                    }}
                >
                    <FormControlLabel
                        value="auto"
                        control={<Radio />}
                        label={autoLabel}
                    />
                    <FormControlLabel value="fixed" control={<Radio />} label="Fixed IP Address" />
                </RadioGroup>
                {intifaceAddress !== undefined && (
                    <TextCommitInput
                        value={intifaceAddress}
                        label="Server Address"
                        placeholder="ws://localhost:12345"
                        onCommit={setIntifaceAddress}
                    />
                )}
            </Stack>
        </MyAccordion>
    );
}

export default React.memo(IntifaceSettingsSection);
