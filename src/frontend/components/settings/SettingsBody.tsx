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
import {SettingsStatePayload} from "../../../common/ipcContract";
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
    const intifaceConnectedAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.intifaceConnected), [settingsStateAtom]);
    const vrchatConnectedAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.vrchatConnected), [settingsStateAtom]);
    const hasSpsZonesAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.hasSpsZones), [settingsStateAtom]);
    const outdatedAvatarDetectedAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.outdatedAvatarDetected), [settingsStateAtom]);
    const vrchatOscEnabledWarningAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.vrchatOscEnabledWarning), [settingsStateAtom]);
    const vrchatSelfInteractWarningAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.vrchatSelfInteractWarning), [settingsStateAtom]);
    const vrchatEveryoneInteractWarningAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.vrchatEveryoneInteractWarning), [settingsStateAtom]);
    const vrchatOscStartupWarningAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.vrchatOscStartupWarning), [settingsStateAtom]);
    const vrchatOscStartupWarningTextAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.vrchatOscStartupWarningText), [settingsStateAtom]);
    const vrchatLogsFoundAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.vrchatLogsFound), [settingsStateAtom]);
    const oscqueryStatusAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.oscqueryStatus), [settingsStateAtom]);
    const oscStatusAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.oscStatus), [settingsStateAtom]);
    const mdnsWorkingAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.mdnsWorking), [settingsStateAtom]);
    const importedAllDeletesAtAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.importedAllDeletesAt), [settingsStateAtom]);
    const detectedVrcConfigDirAtom = useMemo(() => selectAtom(settingsStateAtom, (state) => state.detectedVrcConfigDir), [settingsStateAtom]);
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
    const configuredOutputCountAtom = useMemo(
        () => selectAtom(configuredOutputsAtom, outputs => outputs.length),
        [configuredOutputsAtom],
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
    const configuredOutputCount = useAtomValue(configuredOutputCountAtom);
    const intifaceConnected = useAtomValue(intifaceConnectedAtom);
    const vrchatConnected = useAtomValue(vrchatConnectedAtom);
    const hasSpsZones = useAtomValue(hasSpsZonesAtom);
    const outdatedAvatarDetected = useAtomValue(outdatedAvatarDetectedAtom);
    const vrchatOscEnabledWarning = useAtomValue(vrchatOscEnabledWarningAtom);
    const vrchatSelfInteractWarning = useAtomValue(vrchatSelfInteractWarningAtom);
    const vrchatEveryoneInteractWarning = useAtomValue(vrchatEveryoneInteractWarningAtom);
    const vrchatOscStartupWarning = useAtomValue(vrchatOscStartupWarningAtom);
    const vrchatOscStartupWarningText = useAtomValue(vrchatOscStartupWarningTextAtom);
    const vrchatLogsFound = useAtomValue(vrchatLogsFoundAtom);
    const oscqueryStatus = useAtomValue(oscqueryStatusAtom);
    const oscStatus = useAtomValue(oscStatusAtom);
    const mdnsWorking = useAtomValue(mdnsWorkingAtom);
    const importedAllDeletesAt = useAtomValue(importedAllDeletesAtAtom);
    const detectedVrcConfigDir = useAtomValue(detectedVrcConfigDirAtom);
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

    let intifaceWarning;
    if (intifaceConnected && configuredOutputCount === 0 && unconfiguredOutputs.length === 0) {
        intifaceWarning = "No devices are connected to Intiface";
    } else {
        intifaceWarning = undefined;
    }
    const vrchatWarning = vrchatConnected && !hasSpsZones;
    const hasVrchatWarnings = vrchatWarning
        || vrchatOscEnabledWarning
        || vrchatSelfInteractWarning
        || vrchatEveryoneInteractWarning
        || outdatedAvatarDetected
        || vrchatOscStartupWarning
        || !vrchatLogsFound
        || oscqueryStatus !== 'success'
        || oscStatus !== 'connected'
        || !mdnsWorking;

    return (
        <Stack spacing={0}>
            <IntifaceSettingsSection
                expanded={intifaceExpanded}
                onChange={setIntifaceExpanded}
                intifaceConnected={intifaceConnected}
                intifaceWarning={intifaceWarning}
                intifaceAddress={intifaceAddress ?? ''}
                onIntifaceAddressCommit={setIntifaceAddress}
            />

            <VrchatSettingsSection
                expanded={vrchatExpanded}
                onChange={setVrchatExpanded}
                vrchatConnected={vrchatConnected}
                hasVrchatWarnings={hasVrchatWarnings}
                vrchatWarning={vrchatWarning}
                outdatedAvatarDetected={outdatedAvatarDetected}
                vrchatOscEnabledWarning={vrchatOscEnabledWarning}
                vrchatSelfInteractWarning={vrchatSelfInteractWarning}
                vrchatEveryoneInteractWarning={vrchatEveryoneInteractWarning}
                vrchatOscStartupWarning={vrchatOscStartupWarning}
                vrchatOscStartupWarningText={vrchatOscStartupWarningText}
                vrchatLogsFound={vrchatLogsFound}
                oscqueryStatus={oscqueryStatus}
                oscStatus={oscStatus}
                mdnsWorking={mdnsWorking}
                maxLevelParam={maxLevelParam ?? ''}
                onMaxLevelParamCommit={setMaxLevelParam}
                vrcConfigDir={vrcConfigDir ?? ''}
                detectedVrcConfigDir={detectedVrcConfigDir}
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
