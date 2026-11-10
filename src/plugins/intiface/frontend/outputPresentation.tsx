import React from 'react';
import {atom} from 'jotai';
import {selectAtom} from 'jotai/utils';
import type {OutputPresentation, OutputPresentationAtoms} from '../../../frontend/plugins/Plugin';
import CountdownText, {formatDuration} from '../../../frontend/components/util/CountdownText';

const LEGACY_ALL_OUTPUT_ID = "intiface.imported.all";
const LEGACY_OUTPUT_ID_PREFIX = "intiface.imported.";

function getLegacyDisplayName(id: string): string | undefined {
    if (!id.startsWith(LEGACY_OUTPUT_ID_PREFIX)) return undefined;
    const name = id.substring(LEGACY_OUTPUT_ID_PREFIX.length);
    return `Imported Device: ${name}`;
}

export function outputPresentation({outputId: outputIdAtom, info: infoAtom, settings}: OutputPresentationAtoms) {
    const connectedAtom = selectAtom(settings, state => state.intifaceConnected);
    const deletesAtAtom = selectAtom(settings, state => state.importedDeletesAt);
    return atom<OutputPresentation>(get => {
        const outputId = get(outputIdAtom);
        const info = get(infoAtom);
        const intifaceConnected = get(connectedAtom);
        const importedDeletesAt = get(deletesAtAtom);
        const isLegacyDevice = outputId.startsWith(LEGACY_OUTPUT_ID_PREFIX);
        const isLegacyAllDevice = outputId === LEGACY_ALL_OUTPUT_ID;
        const warningText = (() => {
            if (isLegacyAllDevice) return "This 'all' config was imported from an old version of OGB, and will be used for all newly-connected devices.";
            if (isLegacyDevice) return "This device config was imported from an old version of OGB, and will be reused next time a matching device is connected.";
            return undefined;
        })();
        const importedExpiryWarning = (() => {
            if (!isLegacyDevice) return undefined;
            if (importedDeletesAt === undefined) return undefined;
            return (
                <CountdownText targetTime={importedDeletesAt}>
                    {(remaining) => {
                        if (remaining <= 0) return "This imported config has expired and will be deleted shortly.";
                        return `This imported config will expire and be deleted in ${formatDuration(remaining)}.`;
                    }}
                </CountdownText>
            );
        })();
        const alerts: OutputPresentation['alerts'] = [];
        if (warningText != null) {
            alerts.push({severity: "warning", content: warningText});
        }
        if (info?.name?.toLowerCase().includes("lovense connect")) {
            alerts.push({
                severity: "warning",
                content: "Lovense Connect support in Intiface is deprecated and likely doesn't work at all. Please consider removing Lovense Connect from your phone, remove Intiface from your desktop, and install the Intiface app from the app store on your phone. The intiface mobile app works in place of Lovense Connect.",
            });
        }
        if (importedExpiryWarning != null) {
            alerts.push({severity: "warning", content: importedExpiryWarning});
        }
        if (!info?.connected) {
            alerts.push({
                severity: "error",
                content: intifaceConnected
                    ? "This device is not connected to Intiface."
                    : "This device is unavailable because Intiface is not connected.",
            });
        }


        return {name: getLegacyDisplayName(outputId), alerts};
    });
}
