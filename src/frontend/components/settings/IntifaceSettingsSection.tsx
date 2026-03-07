import React from "react";
import {Alert, Stack, Typography} from "@mui/material";
import TextCommitInput from "../util/TextCommitInput";
import MyAccordion from "../util/MyAccordion";
import ConnectionBubble from "./ConnectionBubble";

interface Props {
    expanded: boolean;
    onChange: (expanded: boolean) => void;
    intifaceConnected: boolean;
    intifaceWarning?: string;
    intifaceAddress: string;
    onIntifaceAddressCommit: (value: string) => void;
}

function IntifaceSettingsSection({
    expanded,
    onChange,
    intifaceConnected,
    intifaceWarning,
    intifaceAddress,
    onIntifaceAddressCommit,
}: Props) {
    return (
        <MyAccordion
            expanded={expanded}
            onChange={onChange}
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

