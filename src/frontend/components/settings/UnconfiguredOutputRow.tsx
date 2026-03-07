import React from "react";
import {Button, Stack, Typography} from "@mui/material";
import {OutputDeviceInfo} from "../../../common/ipcContract";
import MyAccordion from "../util/MyAccordion";
import ConnectionBubble from "./ConnectionBubble";
import {type Atom, useAtomValue, useSetAtom, type WritableAtom} from "jotai";

interface Props {
    outputAtom: Atom<OutputDeviceInfo | undefined>;
    linkOutputAtom: WritableAtom<null, [string], void>;
}

function UnconfiguredOutputRow({outputAtom, linkOutputAtom}: Props) {
    const output = useAtomValue(outputAtom);
    const linkOutput = useSetAtom(linkOutputAtom);
    if (!output) return null;
    const outputPercentLabel = output.currentLevel > 0 ? ` (${Math.round(output.currentLevel * 100)}%)` : '';
    return (
        <MyAccordion
            expanded={false}
            onChange={() => {}}
            summary={
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{width: '100%'}}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <ConnectionBubble color="success.main" />
                        <Typography variant="h6">{output.name || output.id}{outputPercentLabel}</Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" color="text.secondary">{output.id}</Typography>
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                linkOutput(output.id);
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

export default React.memo(UnconfiguredOutputRow);
