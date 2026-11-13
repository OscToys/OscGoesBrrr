import {atom} from 'jotai';
import {selectAtom} from 'jotai/utils';
import type {OutputPresentation, OutputPresentationAtoms} from '../../../frontend/plugins/Plugin';

export function outputPresentation({outputId: outputIdAtom, info: infoAtom, settings}: OutputPresentationAtoms) {
    const connectedAtom = selectAtom(settings, state => state.intifaceConnected);
    return atom<OutputPresentation | undefined>(get => {
        const outputId = get(outputIdAtom);
        if (!outputId.startsWith('intiface.')) return undefined;
        const info = get(infoAtom);
        const intifaceConnected = get(connectedAtom);
        const alerts: OutputPresentation['alerts'] = [];
        if (info?.name?.toLowerCase().includes("lovense connect")) {
            alerts.push({
                severity: "warning",
                content: "Lovense Connect support in Intiface is deprecated and likely doesn't work at all. Please consider removing Lovense Connect from your phone, remove Intiface from your desktop, and install the Intiface app from the app store on your phone. The intiface mobile app works in place of Lovense Connect.",
            });
        }
        if (!info?.connected) {
            alerts.push({
                severity: "error",
                content: intifaceConnected
                    ? "This device is not connected to Intiface."
                    : "This device is unavailable because Intiface is not connected.",
            });
        }


        return {alerts};
    });
}
