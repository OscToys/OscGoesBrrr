import 'reflect-metadata';
import 'source-map-support/register';
import {app} from 'electron';
import util from 'util';
import Bridge from './bridge';
import Updater from './updater';
import OscConnection from "./OscConnection";
import Buttplug from "./Buttplug";
import VrcConfigCheck from "./VrcConfigCheck";
import {Container} from "typedi";
import MainWindowService from "./services/MainWindowService";
import ConfigService from "./services/ConfigService";
import LoggerService from "./services/LoggerService";
import VrchatOscqueryService from "./services/VrchatOscqueryService";
import VrchatLogScanner from "./services/VrchatLogScanner";
import VrchatLogFinder from "./services/VrchatLogFinder";
import BackendDataService from "./services/BackendDataService";
import ImportedOutputPromotionService from "./services/migrate/ImportedOutputPromotionService";
import {handleIpc} from "./ipc";
import type {ButtplugFeatureInformation, Device} from "./ButtplugSpec";
import {configurePortableDataPaths} from "./portableData";

app.enableSandbox();

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.exit();
    process.exit(0);
}
configurePortableDataPaths(app);

const container = Container;
container.get(Updater);
const configService = container.get(ConfigService);
const backendDataService = container.get(BackendDataService);
const importedOutputPromotionService = container.get(ImportedOutputPromotionService);

const vrcConfigCheck = container.get(VrcConfigCheck);
const mainWindowService = container.get(MainWindowService);
const logger = container.get(LoggerService);
const oscConnection = container.get(OscConnection);
const vrchatOscqueryService = container.get(VrchatOscqueryService);
const logScanner = container.get(VrchatLogScanner);
const vrchatLogFinder = container.get(VrchatLogFinder);

{
    const systemLogger = logger.get('system');
    console.log = (...args) => systemLogger.log("LOG", util.format(...args));
    console.warn = (...args) => systemLogger.log("WARN", util.format(...args));
    console.error = (...args) => systemLogger.log("ERROR", util.format(...args));
}

const butt = container.get(Buttplug);
const bridge = container.get(Bridge);

handleIpc('bioStatus:get', async () => {
    let bioStatus = '';
    if (butt.wsReady()) {
        const devices = Array.from(bridge.getOutputs()).map(outputDevice => outputDevice.getStatus());
        devices.sort();
        let devicesStr;
        if (devices.length) {
            devicesStr = devices.join('\n');
        } else {
            devicesStr = 'None';
        }
        bioStatus = 'Connected to Intiface!\nConnected Devices:\n' + devicesStr;
    } else {
        bioStatus = 'Not connected to Intiface.\nIs Intiface running?\nDid you click Start Server?';
    }
    return bioStatus;
});

handleIpc('oscStatus:get', async () => {

    const gameDevices = Array.from(bridge.getGameDevices());
    const sections: string[] = [];

    if (vrcConfigCheck.oscEnabled === false) {
        sections.push(`OSC is disabled in your game.\nEnable it in the radial menu:\nOptions > OSC > Enabled`);
    }
    if (vrcConfigCheck.selfInteractEnabled === false) {
        sections.push('Self-Interaction is disabled in your game.\nThis breaks many OGB features.\nEnable it in the quick menu:\nSettings > Avatar Interactions > Self Interact');
    }
    if (vrcConfigCheck.everyoneInteractEnabled === false) {
        sections.push('Interaction is not set to everyone in game.\nEnable it in the quick menu:\nSettings > Avatar Interactions > Everyone');
    }
    if (logScanner.failure) {
        sections.push(`VRChat's log indicated that it failed to start OSC:\n${logScanner.failure}`);
    }

    if (!oscConnection || !oscConnection.socketopen) {
        sections.push(`OSC socket is starting ...`);
    } else {
        sections.push(
            `OGB OSC: ${oscConnection.port}\n`
            + `OGB OSCQ: ${oscConnection.useOscQuery ? 'Enabled' : 'Disabled'}\n`
            + `VRC OSC: ${vrchatOscqueryService.getOscAddress()?.join(':')}\n`
            + `VRC OSCQ: ${vrchatOscqueryService.getOscqueryAddress()?.join(':')}`
        );
        if (!oscConnection.isGameOpenAndActive()) {
            sections.push(`No updates received recently.\nIs the game open and active?`);
        }
        if (oscConnection?.waitingForBulk) {
            sections.push(`Waiting for bulk packet from OSCQuery`);
        }
    }

    if (vrcConfigCheck.selfInteractEnabled !== false) {
        const hasVrcfHaptics = gameDevices.some(device => device.type == 'Pen' || device.type == 'Orf');
        let isVrcfHapticsUpToDate = false;
        if (oscConnection) {
            for (const [key, value] of oscConnection.entries()) {
                if (key == "VFH/Version/9"
                        || key == "VFH/Version/10"
                        || (key.startsWith("OGB/Pen/") && key.endsWith("/Version/8"))
                        || (key.startsWith("OGB/Orf/") && key.endsWith("/Version/9"))
                ) {
                    isVrcfHapticsUpToDate = true;
                    break;
                }
            }
        }
        if (hasVrcfHaptics && !isVrcfHapticsUpToDate) {
            sections.push('OUTDATED AVATAR DETECTED\n' +
                    'Your avatar was not built using\nthe newest version of VRCFury Haptics.\n' +
                    'Penetration may not work or be less effective.')
        }
    }

    if (gameDevices.length > 0) {
        const gameDeviceStatuses = gameDevices.map(d => d.getStatus());
        gameDeviceStatuses.sort();
        sections.push(gameDeviceStatuses.join('\n'));
    }

    const globalSources = bridge.getGlobalSources(false);
    if (globalSources.length > 0) {
        const globalSourcesLines = globalSources
                .map(source => source.deviceType + '.' + source.deviceName + '.' + source.featureName + '=' + source.value);
        globalSourcesLines.sort();
        sections.push("Other sources:\n" + globalSourcesLines.join('\n'));
    }

    return sections.join('\n\n');
});

handleIpc('avatarParams:get', async () => {
    const map = new Map<string, unknown>();
    if (oscConnection) {
        for (const [key, value] of oscConnection.entries()) {
            map.set(key, value.get());
        }
    }
    return map;
});

handleIpc('settings-state:request', async () => {
    await backendDataService.get();

    const error = backendDataService.getLoadError();
    if (error) {
        mainWindowService.send('settings-state:changed', {ok: false, error});
        return;
    }

    const intifaceConnected = butt.wsReady();
    const vrchatConnected = oscConnection.isGameOpenAndActive();
    const detectedVrcConfigDir = await vrchatLogFinder.getDetectedVrcConfigDir();
    const connectedOutputDevices = Array.from(bridge.getOutputs());
    const history = await backendDataService.getAllDeviceHistory();
    const importedAllDeletesAt = await importedOutputPromotionService.getImportedAllDeletionTime();
    const result = new Map<string, {
        id: string,
        name: string,
        connected: boolean,
        showLinearActuatorOptions: boolean,
    }>();
    const naming = new Map<string, {
        deviceName: string,
        deviceIndex?: number,
        featureDescriptor?: string,
    }>();

    const trimToUndefined = (raw: string | undefined): string | undefined => {
        if (!raw) return undefined;
        const trimmed = raw.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    };
    const getDeviceName = (device: Device, fallback: string): string =>
        trimToUndefined(device.DeviceDisplayName)
        ?? trimToUndefined(device.DeviceName)
        ?? fallback;
    const getIntifaceDeviceId = (device: Device): number | undefined => device.DeviceIndex;
    const getFeatureDescriptor = (feature: ButtplugFeatureInformation): string | undefined =>
        trimToUndefined(feature.FeatureDescription);

    // Add history first as disconnected.
    for (const [id, item] of Object.entries(history)) {
        const fallbackName = id;
        result.set(id, {
            id,
            name: fallbackName,
            connected: false,
            showLinearActuatorOptions: item.intiface.selectedOutput === 'Position' || item.intiface.selectedOutput === 'PositionWithDuration',
        });
        naming.set(id, {
            deviceName: getDeviceName(item.intiface.device, fallbackName),
            deviceIndex: getIntifaceDeviceId(item.intiface.device),
            featureDescriptor: getFeatureDescriptor(item.intiface.feature),
        });
    }

    for (const outputDevice of connectedOutputDevices) {
        const id = outputDevice.bioFeature.id;
        const name = id;
        const existing = result.get(id);
        if (!existing) {
            result.set(id, {
                id,
                name,
                connected: true,
                showLinearActuatorOptions: outputDevice.bioFeature.type === 'linear',
            });
            naming.set(id, {
                deviceName: getDeviceName(outputDevice.bioFeature.intiface.device, name),
                deviceIndex: getIntifaceDeviceId(outputDevice.bioFeature.intiface.device),
                featureDescriptor: getFeatureDescriptor(outputDevice.bioFeature.intiface.feature),
            });
        } else {
            existing.connected = true;
            existing.name = name;
            existing.showLinearActuatorOptions = existing.showLinearActuatorOptions || outputDevice.bioFeature.type === 'linear';
            naming.set(id, {
                deviceName: getDeviceName(outputDevice.bioFeature.intiface.device, name),
                deviceIndex: getIntifaceDeviceId(outputDevice.bioFeature.intiface.device),
                featureDescriptor: getFeatureDescriptor(outputDevice.bioFeature.intiface.feature),
            });
        }
    }

    const entries = Array.from(result.values());
    const deviceNameCounts = new Map<string, number>();
    const featuresPerDevice = new Map<string, number>();
    const descriptorCountsPerDevice = new Map<string, Map<string, number>>();
    const deviceKey = (deviceName: string, deviceIndex?: number) => `${deviceName}::${deviceIndex ?? 'unknown'}`;

    for (const entry of entries) {
        const nameParts = naming.get(entry.id);
        if (!nameParts) continue;
        deviceNameCounts.set(nameParts.deviceName, (deviceNameCounts.get(nameParts.deviceName) ?? 0) + 1);
        const key = deviceKey(nameParts.deviceName, nameParts.deviceIndex);
        featuresPerDevice.set(key, (featuresPerDevice.get(key) ?? 0) + 1);
        const descriptorKey = nameParts.featureDescriptor ?? '';
        let descriptorCounts = descriptorCountsPerDevice.get(key);
        if (!descriptorCounts) {
            descriptorCounts = new Map<string, number>();
            descriptorCountsPerDevice.set(key, descriptorCounts);
        }
        descriptorCounts.set(descriptorKey, (descriptorCounts.get(descriptorKey) ?? 0) + 1);
    }

    for (const entry of entries) {
        const nameParts = naming.get(entry.id);
        if (!nameParts) continue;
        const key = deviceKey(nameParts.deviceName, nameParts.deviceIndex);
        const duplicateDeviceName = (deviceNameCounts.get(nameParts.deviceName) ?? 0) > 1;
        const hasMultipleFeaturesOnDevice = (featuresPerDevice.get(key) ?? 0) > 1;

        let composed = nameParts.deviceName;
        if (duplicateDeviceName && nameParts.deviceIndex !== undefined) {
            composed += ` [${nameParts.deviceIndex}]`;
        }
        if (hasMultipleFeaturesOnDevice && nameParts.featureDescriptor) {
            composed += ` - ${nameParts.featureDescriptor}`;
        }
        entry.name = composed;
    }

    mainWindowService.send('settings-state:changed', {
        ok: true,
        data: {
            outputs: entries,
            intifaceConnected,
            vrchatConnected,
            importedAllDeletesAt,
            detectedVrcConfigDir,
        },
    });

});

handleIpc('fft:status', (level) => {
    if (level < 0 || level > 1 || isNaN(level)) return;
    bridge.receivedFft(level);
})

setInterval(() => {
    const hasSystemAudioLinks = Array.from(bridge.getOutputs()).some(outputDevice => {
        const outputConfig = configService.getOutput(outputDevice.bioFeature.id);
        return outputConfig?.links.some(link => link.kind === 'systemAudio') ?? false;
    });
    mainWindowService.send(hasSystemAudioLinks ? 'fft:start' : 'fft:stop');
}, 1000);

configService.startExternalWatch().catch((e) => {
    console.error("Failed to start external config watch", e);
});

