import React from "react";
import {Button, Stack, Typography} from "@mui/material";
import {Label as LabelIcon, Waves as WavesIcon} from "@mui/icons-material";
import {OutputDeviceInfo} from "../../../common/application/ipcContract";
import MyAccordion from "../util/MyAccordion";
import ConnectionBubble from "./ConnectionBubble";
import {type Atom, useAtomValue, useSetAtom, type WritableAtom} from "jotai";
import type {OutputIdentity} from '../../../common/application/outputIdentity';
import {pluginsById} from '../../plugins/plugins';

interface Props {
    outputAtom: Atom<OutputDeviceInfo | undefined>;
    linkOutputAtom: WritableAtom<null, [OutputIdentity], void>;
}

function UnconfiguredOutputRow({outputAtom, linkOutputAtom}: Props) {
    const output = useAtomValue(outputAtom);
    const linkOutput = useSetAtom(linkOutputAtom);
    if (!output) return null;
    const outputPercent = output.currentLevel > 0 ? Math.round(output.currentLevel * 100) : 0;
    return (
        <MyAccordion
            expanded={false}
            onChange={() => {}}
            summary={
                <Stack direction="row" sx={{width: '100%', alignItems: 'center', justifyContent: 'space-between'}}>
                    <Stack direction="row" spacing={1} sx={{alignItems: 'center', minWidth: 0, flex: 1, mr: 1}}>
                        <ConnectionBubble color="success.main" />
                        <Stack sx={{minWidth: 0}}>
                            <Typography variant="h6" sx={{lineHeight: 1.25}} noWrap>{output.name || output.id}</Typography>
                            <Typography variant="caption" color="textDisabled" sx={{fontSize: '0.65rem', lineHeight: 1.25}} noWrap>
                                {pluginsById.get(output.plugin)?.name ?? 'Plugin Unavailable'}
                            </Typography>
                        </Stack>
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}>
                        {outputPercent > 0 && (
                            <Stack direction="row" spacing={0.25} sx={{alignItems: 'center'}}>
                                <WavesIcon sx={{fontSize: 14, color: 'text.secondary'}} />
                                <Typography variant="body2" color="text.secondary">{outputPercent}%</Typography>
                            </Stack>
                        )}
                        <Stack direction="row" spacing={0.25} sx={{alignItems: 'center'}}>
                            <LabelIcon sx={{fontSize: 14, color: 'text.secondary'}} />
                            <Typography variant="body2" color="text.secondary">{output.id}</Typography>
                        </Stack>
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                linkOutput({plugin: output.plugin, id: output.id});
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
