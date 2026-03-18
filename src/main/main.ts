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
import MyAddressesService from "./services/MyAddressesService";
import {handleIpc} from "./ipc";
import {OscqueryStatus} from "../common/ipcContract";
import type {ButtplugFeatureInformation, Device, IntifaceDeviceFeatureSelection} from "./ButtplugSpec";
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
const myAddressesService = container.get(MyAddressesService);

{
    const systemLogger = logger.get('system');
    console.log = (...args) => systemLogger.log("LOG", util.format(...args));
    console.warn = (...args) => systemLogger.log("WARN", util.format(...args));
    console.error = (...args) => systemLogger.log("ERROR", util.format(...args));
}

const butt = container.get(Buttplug);
const bridge = container.get(Bridge);

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
    const intifaceAddressOffSubnet = isFixedIntifaceAddressOffSubnet(
        configService.getCached().intifaceAddress,
        myAddressesService,
    );
    const vrchatConnected = oscConnection.isGameOpenAndActive();
    const detectedVrcConfigDir = await vrchatLogFinder.getDetectedVrcConfigDir();
    const connectedOutputDevices = Array.from(bridge.getOutputs());
    const gameDevices = Array.from(bridge.getGameDevices());
    const hasSpsZones = gameDevices.some(device => device.type === 'Pen' || device.type === 'Orf' || device.type === 'Touch');
    const detectedSpsPlugIds = Array.from(new Set(gameDevices.filter(device => device.type === 'Pen').map(device => device.id))).sort();
    const detectedSpsSocketIds = Array.from(new Set(gameDevices.filter(device => device.type === 'Orf').map(device => device.id))).sort();
    const detectedSpsTouchZoneIds = Array.from(new Set(gameDevices.filter(device => device.type === 'Touch').map(device => device.id))).sort();
    const history = await backendDataService.getAllDeviceHistory();
    await importedOutputPromotionService.cleanupExpiredImportedOutputs();
    const importedDeletesAt = await importedOutputPromotionService.getImportedDeletesAt();
    const oscStatusSnapshot = oscConnection.getStatusSnapshot();
    const oscqueryStatus = vrchatOscqueryService.getStatus();
    const ogbOscPort = oscConnection.socketopen ? (oscStatusSnapshot.mdnsWorking ? oscConnection.port : 9001) : undefined;
    const ogbOscqueryPort = oscStatusSnapshot.mdnsWorking ? oscConnection.port : undefined;
    const vrcOscPort = vrchatOscqueryService.getOscAddress()?.[1];
    const vrcOscqueryPort = vrchatOscqueryService.getOscqueryAddress()?.[1];

    const hasVrcfHaptics = gameDevices.some(device => device.type == 'Pen' || device.type == 'Orf');
    let isVrcfHapticsUpToDate = false;
    for (const [key] of oscConnection.entries()) {
        if (key == "VFH/Version/9"
                || key == "VFH/Version/10"
                || (key.startsWith("OGB/Pen/") && key.endsWith("/Version/8"))
                || (key.startsWith("OGB/Orf/") && key.endsWith("/Version/9"))
        ) {
            isVrcfHapticsUpToDate = true;
            break;
        }
    }
    const outdatedAvatarDetected = hasVrcfHaptics && !isVrcfHapticsUpToDate;

    const result = new Map<string, {
        id: string,
        name: string,
        connected: boolean,
        showLinearActuatorOptions: boolean,
        currentLevel: number,
        lastSources: number[],
    }>();
    const naming = new Map<string, {
        deviceName: string,
        deviceIndex: number,
        featureDescriptor?: string,
        featureIndex: number,
    }>();

    const trimToUndefined = (raw: string | undefined): string | undefined => {
        if (!raw) return undefined;
        const trimmed = raw.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    };

    // Add history first as disconnected.
    const getNaming = (feature: IntifaceDeviceFeatureSelection, id: string) => {
        return {
            deviceName: trimToUndefined(feature.device.DeviceDisplayName)
                ?? trimToUndefined(feature.device.DeviceName)
                ?? id,
            deviceIndex: feature.device.DeviceIndex,
            featureDescriptor: trimToUndefined(feature.feature.FeatureDescription),
            featureIndex: feature.feature.FeatureIndex,
        }
    };
    for (const [id, item] of Object.entries(history)) {
        result.set(id, {
            id,
            name: id,
            connected: false,
            showLinearActuatorOptions: item.intiface.selectedOutput === 'Position' || item.intiface.selectedOutput === 'HwPositionWithDuration',
            currentLevel: 0,
            lastSources: [],
        });
        naming.set(id, getNaming(item.intiface, id));
    }
    for (const outputDevice of connectedOutputDevices) {
        const id = outputDevice.bioFeature.id;
        result.set(id, {
            id,
            name: id,
            connected: true,
            showLinearActuatorOptions: outputDevice.bioFeature.type === 'linear',
            currentLevel: outputDevice.getCurrentLevel(),
            lastSources: outputDevice.getLastSources(),
        });
        naming.set(id, getNaming(outputDevice.bioFeature.intiface, id));
    }

    const entries = Array.from(result.values());
    const deviceNameToDeviceKeys = new Map<string, Set<string>>();
    const featuresPerDevice = new Map<string, number>();
    const descriptorCountsPerDevice = new Map<string, Map<string, number>>();
    const deviceKey = (deviceName: string, deviceIndex?: number) => `${deviceName}::${deviceIndex ?? 'unknown'}`;

    for (const entry of entries) {
        const nameParts = naming.get(entry.id);
        if (!nameParts) continue;
        const key = deviceKey(nameParts.deviceName, nameParts.deviceIndex);
        let deviceKeys = deviceNameToDeviceKeys.get(nameParts.deviceName);
        if (!deviceKeys) {
            deviceKeys = new Set<string>();
            deviceNameToDeviceKeys.set(nameParts.deviceName, deviceKeys);
        }
        deviceKeys.add(key);
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
        const duplicateDeviceName = (deviceNameToDeviceKeys.get(nameParts.deviceName)?.size ?? 0) > 1;
        const hasMultipleFeaturesOnDevice = (featuresPerDevice.get(key) ?? 0) > 1;

        let composed = nameParts.deviceName;
        if (duplicateDeviceName && nameParts.deviceIndex !== undefined) {
            composed += ` [${nameParts.deviceIndex}]`;
        }
        if (hasMultipleFeaturesOnDevice) {
            if (nameParts.featureDescriptor) {
                composed += ` - ${nameParts.featureDescriptor}`;
            } else {
                composed += ` - Output ${nameParts.featureIndex}`;
            }
        }
        entry.name = composed;
    }

    mainWindowService.send('settings-state:changed', {
        ok: true,
        data: {
            outputs: entries,
            intifaceConnected,
            intifaceAddressOffSubnet,
            vrchat: {
                connected: vrchatConnected,
                warnings: {
                    hasSpsZones,
                    outdatedAvatarDetected,
                    oscEnabled: vrcConfigCheck.oscEnabled === false,
                    selfInteract: vrcConfigCheck.selfInteractEnabled === false,
                    everyoneInteract: vrcConfigCheck.everyoneInteractEnabled === false,
                    oscStartup: Boolean(logScanner.failure),
                    oscStartupText: logScanner.failure,
                    logsFound: vrchatOscqueryService.getLogsFound(),
                    oscqueryStatus,
                    oscStatus: oscStatusSnapshot.status,
                    mdnsWorking: oscStatusSnapshot.mdnsWorking,
                },
                ogbOscPort,
                ogbOscqueryPort,
                vrcOscPort,
                vrcOscqueryPort,
                detectedSpsPlugIds,
                detectedSpsSocketIds,
                detectedSpsTouchZoneIds,
                detectedVrcConfigDir,
            },
            importedDeletesAt,
        },
    });

});

function isFixedIntifaceAddressOffSubnet(
    intifaceAddress: string | undefined,
    myAddressesService: MyAddressesService,
): boolean {
    if (!intifaceAddress) return false;
    try {
        const parsed = new URL(intifaceAddress);
        const hostname = parsed.hostname.trim();
        if (!hostname) return false;
        const normalized = hostname.toLowerCase();
        if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1') {
            return false;
        }
        return !myAddressesService.sharesSubnet(hostname);
    } catch {
        return false;
    }
}

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

