import React, {useMemo, useState} from "react";
import {OutputConfig} from "../../../common/application/configTypes";
import {OutputDeviceInfo} from "../../../common/application/ipcContract";
import {Alert, IconButton, Stack, Switch, Typography} from "@mui/material";
import {Delete as DeleteIcon, Label as LabelIcon, Waves as WavesIcon} from "@mui/icons-material";
import MyAccordion from "../util/MyAccordion";
import ConnectionBubble from "./ConnectionBubble";
import OutputLinks from "./OutputLinks";
import {atom, type Atom, type PrimitiveAtom, useAtom, useAtomValue} from "jotai";
import {selectAtom} from "jotai/utils";
import {focusKeyAtom} from "../../utils/atomUtils";
import {getConnectionBubbleColor} from "../../utils/connectionBubbleColor";
import {useSettingsStateAtom} from "./SettingsStateAtomContext";

import {pluginsById} from '../../plugins/plugins';
import type {OutputIdentity} from '../../../common/application/outputIdentity';

const inactiveLinkLevelsAtom = atom<number[]>(() => []);

interface Props {
    outputAtom: PrimitiveAtom<OutputConfig>;
    infoAtom: Atom<OutputDeviceInfo | undefined>;
    onDelete: (output: OutputIdentity) => void;
}

function ConfiguredOutputRow({outputAtom, infoAtom, onDelete}: Props) {
    const [expanded, setExpanded] = useState(false);
    const linksAtom = useMemo(() => focusKeyAtom(outputAtom, 'links'), [outputAtom]);
    const enabledAtom = useMemo(() => focusKeyAtom(outputAtom, 'enabled'), [outputAtom]);
    const [enabled, setEnabled] = useAtom(enabledAtom);
    const outputIdAtom = useMemo(() => selectAtom(outputAtom, (output) => output.id), [outputAtom]);
    const outputId = useAtomValue(outputIdAtom);
    const outputPluginAtom = useMemo(() => selectAtom(outputAtom, output => output.plugin), [outputAtom]);
    const outputPlugin = useAtomValue(outputPluginAtom);
    const plugin = pluginsById.get(outputPlugin);
    const info = useAtomValue(infoAtom);
    const settingsStateAtom = useSettingsStateAtom();
    const presentationAtom = useMemo(
        () => plugin?.outputPresentation?.({
            outputId: outputIdAtom,
            info: infoAtom,
            settings: settingsStateAtom,
        }) ?? atom(undefined),
        [plugin, outputIdAtom, infoAtom, settingsStateAtom],
    );
    const presentation = useAtomValue(presentationAtom);
    const Editor = plugin?.OutputEditor;
    const unknown = !Editor;
    const displayName = presentation?.name ?? info?.name ?? (unknown ? `Unknown output ${outputPlugin}:${outputId}` : outputId);
    const alerts = presentation?.alerts ?? [];
    const outputPercent = info && info.currentLevel > 0 ? Math.round(info.currentLevel * 100) : 0;
    return (
        <MyAccordion
            expanded={expanded}
            onChange={setExpanded}
            summary={
                <Stack direction="row" sx={{width: '100%', alignItems: 'center', justifyContent: 'space-between'}}>
                    <Stack direction="row" spacing={1} sx={{alignItems: 'center', minWidth: 0, flex: 1, mr: 1}}>
                        <ConnectionBubble color={unknown ? 'warning.main' : getConnectionBubbleColor(alerts)} />
                        <Stack sx={{minWidth: 0}}>
                            <Typography variant="h6" sx={{lineHeight: 1.25}} noWrap>{displayName}</Typography>
                            <Typography variant="caption" color="textDisabled" sx={{fontSize: '0.65rem', lineHeight: 1.25}} noWrap>
                                {plugin?.name ?? 'Plugin Unavailable'}
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
                            <Typography variant="body2" color="text.secondary">{outputId}</Typography>
                        </Stack>
                        <Switch
                            size="small"
                            checked={enabled !== false}
                            onClick={event => event.stopPropagation()}
                            onChange={(_event, checked) => setEnabled(checked)}
                            slotProps={{input: {'aria-label': 'Enable device'}}}
                        />
                        <IconButton
                            component="span"
                            color="error"
                            size="small"
                            aria-label="Unlink output"
                            onClick={e => {
                                e.stopPropagation();
                                onDelete({plugin: outputPlugin, id: outputId});
                            }}
                        >
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                </Stack>
            }
        >
            <Stack spacing={2}>
                {unknown && (
                    <Alert severity="warning">No plugin handles this output. Its settings are preserved.</Alert>
                )}
                {alerts.map((alert, index) => (
                    <Alert key={index} severity={alert.severity}>{alert.content}</Alert>
                ))}
                {Editor
                    ? <Editor outputAtom={outputAtom} infoAtom={infoAtom} />
                    : <OutputLinks linksAtom={linksAtom} linkLevelsAtom={inactiveLinkLevelsAtom} />}
            </Stack>
        </MyAccordion>
    );
}

export default React.memo(ConfiguredOutputRow);
