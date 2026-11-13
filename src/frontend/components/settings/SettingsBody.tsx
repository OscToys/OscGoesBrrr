import React, {useCallback, useMemo, useState} from 'react';
import {produce} from 'immer';
import {Config, type OutputConfig} from '../../../common/application/configTypes';
import {pushItem, removeAt} from "../../../common/arrayDraft";
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Stack,
} from "@mui/material";
import {SettingsStatePayload} from "../../../common/application/ipcContract";
import ConfiguredOutputRow from "./ConfiguredOutputRow";
import UnconfiguredOutputRow from "./UnconfiguredOutputRow";
import {atom, type PrimitiveAtom, useAtomValue, useSetAtom} from "jotai";
import {selectAtom, splitAtom} from "jotai/utils";
import {atomFamily} from "jotai-family";
import {focusKeyAtom} from "../../utils/atomUtils";

import {PluginSettings} from '../../plugins/PluginComponents';
import {pluginsById} from '../../plugins/plugins';
import {outputKey, type OutputIdentity} from '../../../common/application/outputIdentity';

interface Props {
    configAtom: PrimitiveAtom<Config>;
    settingsStateAtom: PrimitiveAtom<SettingsStatePayload>;
}

function SettingsBody({
    configAtom,
    settingsStateAtom,
}: Props) {
    const [pendingDeleteOutput, setPendingDeleteOutput] = useState<OutputIdentity | null>(null);
    const configuredOutputsAtom = useMemo(() => focusKeyAtom(configAtom, 'outputs'), [configAtom]);
    const outputInfosAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.outputs), [settingsStateAtom]);
    const configuredOutputKeySetAtom = useMemo(
        () => atom((get) => new Set(get(configuredOutputsAtom).map(outputKey))),
        [configuredOutputsAtom],
    );
    const configuredOutputAtomsAtom = useMemo(() => splitAtom(configuredOutputsAtom), [configuredOutputsAtom]);
    const configuredSortedOutputsAtom = useMemo(
        () => atom<PrimitiveAtom<OutputConfig>[]>((get) => {
            const outputAtoms = get(configuredOutputAtomsAtom);
            const outputInfos = get(outputInfosAtom);
            const connectedByKey = new Map(outputInfos.map(info => [outputKey(info), info.connected]));
            return [...outputAtoms].sort((a, b) => {
                const aConnected = Boolean(connectedByKey.get(outputKey(get(a))));
                const bConnected = Boolean(connectedByKey.get(outputKey(get(b))));
                if (aConnected === bConnected) return 0;
                return aConnected ? -1 : 1;
            });
        }),
        [configuredOutputAtomsAtom, outputInfosAtom],
    );
    const unconfiguredOutputsAtom = useMemo(
        () => atom((get) => {
            const allOutputs = get(outputInfosAtom);
            const configuredOutputKeys = get(configuredOutputKeySetAtom);
            return allOutputs
                .filter(output => output.connected)
                .filter(output => !configuredOutputKeys.has(outputKey(output)))
                .sort((a, b) => a.name.localeCompare(b.name));
        }),
        [configuredOutputKeySetAtom, outputInfosAtom],
    );
    const outputInfoAtomFamily = useMemo(
        () => atomFamily((key: string) => atom((get) => get(outputInfosAtom).find(info => outputKey(info) === key))),
        [outputInfosAtom],
    );
    const configuredOutputInfoAtomFamily = useMemo(
        () => atomFamily((outputAtom: PrimitiveAtom<OutputConfig>) => atom((get) => {
            const key = outputKey(get(outputAtom));
            return get(outputInfosAtom).find(info => outputKey(info) === key);
        })),
        [outputInfosAtom],
    );
    const linkOutputAtom = useMemo(
        () => atom(
            null,
            (get, set, output: OutputIdentity) => {
                const current = get(configuredOutputsAtom);
                if (current.some(config => outputKey(config) === outputKey(output))) return;
                const config = pluginsById.get(output.plugin)?.createOutput?.(output.id);
                if (!config) return;
                set(configuredOutputsAtom, produce(current, (draft) => {
                    pushItem(draft, config);
                }));
            },
        ),
        [configuredOutputsAtom],
    );
    const configuredSortedOutputs = useAtomValue(configuredSortedOutputsAtom);
    const unconfiguredOutputs = useAtomValue(unconfiguredOutputsAtom);
    const setConfiguredOutputs = useSetAtom(configuredOutputsAtom);
    const requestDeleteOutput = useCallback((output: OutputIdentity) => {
        setPendingDeleteOutput(output);
    }, [setPendingDeleteOutput]);
    const cancelDeleteOutput = useCallback(() => {
        setPendingDeleteOutput(null);
    }, []);
    const confirmDeleteOutput = useCallback(() => {
        if (!pendingDeleteOutput) return;
        setConfiguredOutputs((configuredOutputs) => produce(configuredOutputs, (draft) => {
            const index = draft.findIndex(output => outputKey(output) === outputKey(pendingDeleteOutput));
            if (index >= 0) removeAt(draft, index);
        }));
        setPendingDeleteOutput(null);
    }, [pendingDeleteOutput, setConfiguredOutputs]);

    return (
        <Stack spacing={0}>
            <PluginSettings configAtom={configAtom} />

            {configuredSortedOutputs.map((outputAtom) => {
                return (
                    <ConfiguredOutputRow
                        key={outputAtom.toString()}
                        outputAtom={outputAtom}
                        infoAtom={configuredOutputInfoAtomFamily(outputAtom)}
                        onDelete={requestDeleteOutput}
                    />
                );
            })}

            {unconfiguredOutputs.map((output) => (
                <UnconfiguredOutputRow
                    key={outputKey(output)}
                    outputAtom={outputInfoAtomFamily(outputKey(output))}
                    linkOutputAtom={linkOutputAtom}
                />
            ))}

            <Dialog
                open={pendingDeleteOutput !== null}
                onClose={cancelDeleteOutput}
                aria-labelledby="unlink-output-title"
                aria-describedby="unlink-output-description"
            >
                <DialogTitle id="unlink-output-title">Remove device?</DialogTitle>
                <DialogContent>
                    <DialogContentText id="unlink-output-description">
                        The configuration will be completely deleted. You can link it again later.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={cancelDeleteOutput}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={confirmDeleteOutput}>Remove</Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}

export default React.memo(SettingsBody);
