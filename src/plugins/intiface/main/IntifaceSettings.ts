import {Service} from 'typedi';
import Intiface, {IntifaceOutput} from './Intiface';
import {
    selectIntifaceOutput,
    supportsLinearPreference,
    type IntifaceDeviceFeatureSelection,
} from './IntifaceProtocol';
import ConfigService from '../../../main/services/ConfigService';
import BackendDataService from '../../../main/services/BackendDataService';
import {isIntifaceDeviceHistory} from './deviceHistory';
import ImportedOutputPromotionService from './ImportedOutputPromotionService';
import MyAddressesService from '../../../main/services/MyAddressesService';
import type OutputController from '../../../main/OutputController';
import type {SettingsStatePayload} from '../../../common/ipcContract';

@Service()
export default class IntifaceSettings {
    constructor(
        private readonly intiface: Intiface,
        private readonly configService: ConfigService,
        private readonly backendDataService: BackendDataService,
        private readonly importedOutputPromotionService: ImportedOutputPromotionService,
        private readonly myAddressesService: MyAddressesService,
    ) {}

    async getState(connectedOutputDevices: readonly OutputController[]): Promise<Partial<SettingsStatePayload>> {
        const {
            intiface,
            configService,
            backendDataService,
            importedOutputPromotionService,
            myAddressesService,
        } = this;
        const intifaceConnected = intiface.wsReady();
        const intifaceAddressOffSubnet = isFixedIntifaceAddressOffSubnet(
            configService.getCached().intifaceAddress,
            myAddressesService,
        );
        const history = await backendDataService.getAllDeviceHistory();
        await importedOutputPromotionService.cleanupExpiredImportedOutputs();
        const importedDeletesAt = await importedOutputPromotionService.getImportedDeletesAt();
        const result = new Map<string, {
            id: string,
            name: string,
            connected: boolean,
            showLinearActuatorOptions: boolean,
            supportsLinearPreference: boolean,
            currentLevel: number,
            lastLinkValues: number[],
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

        const configuredOutputIds = new Set(configService.getCached().outputs.map(output => output.id));

        // Add configured history first as disconnected.
        const getNaming = (feature: IntifaceDeviceFeatureSelection, id: string) => {
            return {
                deviceName: trimToUndefined(feature.device.DeviceDisplayName)
                    ?? trimToUndefined(feature.device.DeviceName)
                    ?? id,
                deviceIndex: feature.device.DeviceIndex,
                featureDescriptor: trimToUndefined(feature.feature.FeatureDescription),
                featureIndex: feature.feature.FeatureIndex,
            };
        };
        for (const [id, item] of Object.entries(history)) {
            if (!isIntifaceDeviceHistory(id, item)) continue;
            if (!configuredOutputIds.has(id)) continue;
            result.set(id, {
                id,
                name: id,
                connected: false,
                showLinearActuatorOptions: ['Position', 'HwPositionWithDuration'].includes(
                    selectIntifaceOutput(item.intiface.feature, configService.getOutput(id)?.preferLinear) ?? '',
                ),
                supportsLinearPreference: supportsLinearPreference(item.intiface.feature),
                currentLevel: 0,
                lastLinkValues: [],
            });
            naming.set(id, getNaming(item.intiface, id));
        }
        for (const outputDevice of connectedOutputDevices) {
            if (!(outputDevice.output instanceof IntifaceOutput)) continue;
            const endpoint = outputDevice.output;
            const id = endpoint.id;
            const intifaceFeature = endpoint.intiface;
            result.set(id, {
                id,
                name: id,
                connected: true,
                showLinearActuatorOptions: outputDevice.output.type === 'linear',
                supportsLinearPreference: supportsLinearPreference(intifaceFeature.feature),
                currentLevel: outputDevice.getCurrentLevel(),
                lastLinkValues: outputDevice.getLastLinkValues(),
            });
            naming.set(id, getNaming(intifaceFeature, id));
        }

        const entries = Array.from(result.values());
        const deviceNameToDeviceKeys = new Map<string, Set<string>>();
        const featuresPerDevice = new Map<string, number>();
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

        return {
            outputs: entries,
            intifaceConnected,
            intifaceConnectedAddress: intiface.getConnectedAddress(),
            intifaceAddressOffSubnet,
            importedDeletesAt,
        };
    }
}

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


