import React from "react";
import {Button, Stack, Typography} from "@mui/material";
import isEqual from "lodash/isEqual";
import {OutputDeviceInfo} from "../../../common/ipcContract";
import MyAccordion from "../util/MyAccordion";
import ConnectionBubble from "./ConnectionBubble";

interface Props {
    output: OutputDeviceInfo;
    onLink: (outputId: string) => void;
}

function UnconfiguredOutputRow({output, onLink}: Props) {
    return (
        <MyAccordion
            expanded={false}
            onChange={() => {}}
            summary={
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{width: '100%'}}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <ConnectionBubble color="success.main" />
                        <Typography variant="h6">{output.name || output.id}</Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" color="text.secondary">{output.id}</Typography>
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                onLink(output.id);
                            }}
                        >
                            Link
                        </Button>
                    </Stack>
                </Stack>
            }
        />
    );
}

export default React.memo(UnconfiguredOutputRow, (prev, next) => isEqual(prev.output, next.output));
