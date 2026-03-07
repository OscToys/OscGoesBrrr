import React, {useCallback, useMemo, useState} from 'react';
import {produce} from 'immer';
import {Config, getDefaultLinks, getDefaultOutput, type Output} from '../../../common/configTypes';
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
import {SettingsStatePayload, SettingsStateVrchat} from "../../../common/ipcContract";
import ConfiguredOutputRow from "./ConfiguredOutputRow";
import UnconfiguredOutputRow from "./UnconfiguredOutputRow";
import IntifaceSettingsSection from "./IntifaceSettingsSection";
import VrchatSettingsSection from "./VrchatSettingsSection";
import {atom, type PrimitiveAtom, useAtom, useAtomValue, useSetAtom} from "jotai";
import {selectAtom, splitAtom} from "jotai/utils";
import {atomFamily} from "jotai-family";
import {focusKeyAtom} from "../../utils/atomUtils";

interface Props {
    configAtom: PrimitiveAtom<Config>;
    settingsStateAtom: PrimitiveAtom<SettingsStatePayload>;
}

function SettingsBody({
    configAtom,
    settingsStateAtom,
}: Props) {
    const [intifaceExpanded, setIntifaceExpanded] = useState(false);
    const [vrchatExpanded, setVrchatExpanded] = useState(false);
    const [pendingDeleteOutputId, setPendingDeleteOutputId] = useState<string | null>(null);
    const intifaceAddressAtom = useMemo(() => focusKeyAtom(configAtom, 'intifaceAddress'), [configAtom]);
    const maxLevelParamAtom = useMemo(() => focusKeyAtom(configAtom, 'maxLevelParam'), [configAtom]);
    const vrcConfigDirAtom = useMemo(() => focusKeyAtom(configAtom, 'vrcConfigDir'), [configAtom]);
    const oscProxyAtom = useMemo(() => focusKeyAtom(configAtom, 'oscProxy'), [configAtom]);
    const configuredOutputsAtom = useMemo(() => focusKeyAtom(configAtom, 'outputs'), [configAtom]);
    const outputInfosAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.outputs), [settingsStateAtom]);
    const vrchatAtom = useMemo(
        () => focusKeyAtom(settingsStateAtom, 'vrchat') as PrimitiveAtom<SettingsStateVrchat>,
        [settingsStateAtom],
    );
    const importedAllDeletesAtAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.importedAllDeletesAt), [settingsStateAtom]);
    const importedOutputDeletesAtByIdAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.importedOutputDeletesAtById), [settingsStateAtom]);
    const configuredOutputIdSetAtom = useMemo(
        () => atom((get) => new Set(get(configuredOutputsAtom).map(output => output.id))),
        [configuredOutputsAtom],
    );
    const configuredOutputAtomsAtom = useMemo(() => splitAtom(configuredOutputsAtom), [configuredOutputsAtom]);
    const configuredSortedOutputsAtom = useMemo(
        () => atom<PrimitiveAtom<Output>[]>((get) => {
            const outputAtoms = get(configuredOutputAtomsAtom);
            const outputInfos = get(outputInfosAtom);
            const connectedById = new Map(outputInfos.map(info => [info.id, info.connected]));
            return [...outputAtoms].sort((a, b) => {
                const aConnected = Boolean(connectedById.get(get(a).id));
                const bConnected = Boolean(connectedById.get(get(b).id));
                if (aConnected === bConnected) return 0;
                return aConnected ? -1 : 1;
            });
        }),
        [configuredOutputAtomsAtom, outputInfosAtom],
    );
    const unconfiguredOutputsAtom = useMemo(
        () => atom((get) => {
            const allOutputs = get(outputInfosAtom);
            const configuredOutputIds = get(configuredOutputIdSetAtom);
            return allOutputs
                .filter(output => output.connected)
                .filter(output => !configuredOutputIds.has(output.id))
                .sort((a, b) => a.name.localeCompare(b.name));
        }),
        [configuredOutputIdSetAtom, outputInfosAtom],
    );
    const outputInfoAtomFamily = useMemo(
        () => atomFamily((outputId: string) => atom((get) => get(outputInfosAtom).find(info => info.id === outputId))),
        [outputInfosAtom],
    );
    const configuredOutputInfoAtomFamily = useMemo(
        () => atomFamily((outputAtom: PrimitiveAtom<Output>) => atom((get) => {
            const outputId = get(outputAtom).id;
            return get(outputInfosAtom).find(info => info.id === outputId);
        })),
        [outputInfosAtom],
    );
    const linkOutputAtom = useMemo(
        () => atom(
            null,
            (get, set, outputId: string) => {
                const current = get(configuredOutputsAtom);
                if (current.some(output => output.id === outputId)) return;
                set(configuredOutputsAtom, produce(current, (draft) => {
                    pushItem(draft, {id: outputId, ...getDefaultOutput(), links: getDefaultLinks()});
                }));
            },
        ),
        [configuredOutputsAtom],
    );
    const [intifaceAddress, setIntifaceAddress] = useAtom(intifaceAddressAtom);
    const [maxLevelParam, setMaxLevelParam] = useAtom(maxLevelParamAtom);
    const [vrcConfigDir, setVrcConfigDir] = useAtom(vrcConfigDirAtom);
    const [oscProxy, setOscProxy] = useAtom(oscProxyAtom);
    const importedAllDeletesAt = useAtomValue(importedAllDeletesAtAtom);
    const importedOutputDeletesAtById = useAtomValue(importedOutputDeletesAtByIdAtom);
    const configuredSortedOutputs = useAtomValue(configuredSortedOutputsAtom);
    const unconfiguredOutputs = useAtomValue(unconfiguredOutputsAtom);
    const setConfiguredOutputs = useSetAtom(configuredOutputsAtom);
    const requestDeleteOutput = useCallback((outputId: string) => {
        setPendingDeleteOutputId(outputId);
    }, [setPendingDeleteOutputId]);
    const cancelDeleteOutput = useCallback(() => {
        setPendingDeleteOutputId(null);
    }, []);
    const confirmDeleteOutput = useCallback(() => {
        if (!pendingDeleteOutputId) return;
        setConfiguredOutputs((configuredOutputs) => produce(configuredOutputs, (draft) => {
            const index = draft.findIndex(output => output.id === pendingDeleteOutputId);
            if (index >= 0) removeAt(draft, index);
        }));
        setPendingDeleteOutputId(null);
    }, [pendingDeleteOutputId, setConfiguredOutputs]);

    return (
        <Stack spacing={0}>
            <IntifaceSettingsSection
                expanded={intifaceExpanded}
                onChange={setIntifaceExpanded}
                intifaceAddress={intifaceAddress ?? ''}
                onIntifaceAddressCommit={setIntifaceAddress}
            />

            <VrchatSettingsSection
                expanded={vrchatExpanded}
                onChange={setVrchatExpanded}
                vrchatAtom={vrchatAtom}
                maxLevelParam={maxLevelParam ?? ''}
                onMaxLevelParamCommit={setMaxLevelParam}
                vrcConfigDir={vrcConfigDir ?? ''}
                onVrcConfigDirCommit={setVrcConfigDir}
                oscProxy={oscProxy}
                onSetOscProxy={setOscProxy}
            />

            {configuredSortedOutputs.map((outputAtom) => {
                return (
                    <ConfiguredOutputRow
                        key={outputAtom.toString()}
                        outputAtom={outputAtom}
                        infoAtom={configuredOutputInfoAtomFamily(outputAtom)}
                        importedAllDeletesAt={importedAllDeletesAt}
                        importedOutputDeletesAtById={importedOutputDeletesAtById}
                        onDelete={requestDeleteOutput}
                    />
                );
            })}

            {unconfiguredOutputs.map((output) => (
                <UnconfiguredOutputRow
                    key={output.id}
                    outputAtom={outputInfoAtomFamily(output.id)}
                    linkOutputAtom={linkOutputAtom}
                />
            ))}

            <Dialog
                open={pendingDeleteOutputId !== null}
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
