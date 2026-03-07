import {Service} from "typedi";
import {Output} from "../../../common/configTypes";
import ConfigService from "../ConfigService";
import type {ButtplugFeatureInformation, Device} from "../../ButtplugSpec";
import BackendDataService from "../BackendDataService";
import LegacyTxtConfigImportService from "./LegacyTxtConfigImportService";

@Service()
export default class ImportedOutputPromotionService {
    private static readonly IMPORTED_ALL_DEVICE_TTL_MS = 1000 * 60 * 60 * 24;
    private static readonly IMPORTED_SPECIFIC_DEVICE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

    constructor(
        private readonly configService: ConfigService,
        private readonly backendDataService: BackendDataService,
    ) {}

    async getImportedAllDeletionTime(): Promise<number | undefined> {
        const hasImportedAll = this.configService.getCached().outputs.some(output => output.id === LegacyTxtConfigImportService.IMPORTED_ALL_ID);
        if (!hasImportedAll) return undefined;
        const earliestFirstSeen = await this.getEarliestDeviceHistoryFirstSeen();
        if (earliestFirstSeen === undefined) return undefined;
        return earliestFirstSeen + ImportedOutputPromotionService.IMPORTED_ALL_DEVICE_TTL_MS;
    }

    async getImportedSpecificDeletionTimes(): Promise<Record<string, number>> {
        const history = await this.backendDataService.getAllDeviceHistory();
        const out: Record<string, number> = {};
        for (const output of this.configService.getCached().outputs) {
            if (!this.isImportedSpecificOutputId(output.id)) continue;
            const importedDeviceKey = output.id.substring(LegacyTxtConfigImportService.IMPORTED_ID_PREFIX.length);
            const firstSeen = history[importedDeviceKey]?.firstSeen;
            if (firstSeen === undefined) continue;
            out[output.id] = firstSeen + ImportedOutputPromotionService.IMPORTED_SPECIFIC_DEVICE_TTL_MS;
        }
        return out;
    }

    private async deleteImportedAllIfNeeded() {
        const importedAllDeletionAt = await this.getImportedAllDeletionTime();
        const nowMs = Date.now();
        if (
            importedAllDeletionAt !== undefined
            && nowMs >= importedAllDeletionAt
        ) {
            await this.configService.mutate((config) => {
                config.outputs = config.outputs.filter(output => output.id !== LegacyTxtConfigImportService.IMPORTED_ALL_ID);
            });
        }
    }

    private async deleteImportedSpecificIfNeeded() {
        const importedSpecificDeletionTimes = await this.getImportedSpecificDeletionTimes();
        const nowMs = Date.now();
        const expiredIds = new Set(
            Object.entries(importedSpecificDeletionTimes)
                .filter(([, deleteAt]) => nowMs >= deleteAt)
                .map(([id]) => id),
        );
        if (expiredIds.size === 0) return;
        await this.configService.mutate((config) => {
            config.outputs = config.outputs.filter(output => !expiredIds.has(output.id));
        });
    }

    async cleanupExpiredImportedOutputs(): Promise<void> {
        await this.deleteImportedAllIfNeeded();
        await this.deleteImportedSpecificIfNeeded();
    }

    async promoteImportedOutputForDeviceFeature(
        device: Device,
        currentOutputId: string,
        feature: ButtplugFeatureInformation,
    ): Promise<void> {
        await this.cleanupExpiredImportedOutputs();

        await this.configService.mutate((config) => {
            if (config.outputs.some(output => output.id == currentOutputId)) {
                // Modern config already exists for this device
                return;
            }

            if (!currentOutputId) return;
            const legacyFeatureId = this.getLegacyFeatureId(device, feature);
            if (legacyFeatureId === undefined) return;
            const legacyBaseDeviceId = device.DeviceName.toLowerCase().replace(/ /g, '');

            let importedSpecific: Output | undefined;
            for (let i = 0; i <= 10; i++) {
                const legacyDeviceId = `${legacyBaseDeviceId}${i === 0 ? '' : i}`;
                const importedPreviousId = `${LegacyTxtConfigImportService.IMPORTED_ID_PREFIX}${legacyDeviceId}-${legacyFeatureId}`;
                importedSpecific = config.outputs.find(output => output.id === importedPreviousId);
                if (importedSpecific) break;
            }
            if (importedSpecific) {
                const promoted: Output = {
                    ...importedSpecific,
                    id: currentOutputId,
                };
                config.outputs = config.outputs.filter(output => output.id !== importedSpecific.id && output.id !== currentOutputId);
                config.outputs.push(promoted);
                return;
            }

            const importedAll = config.outputs.find(output => output.id === LegacyTxtConfigImportService.IMPORTED_ALL_ID);
            if (importedAll) {
                const promoted: Output = {
                    ...importedAll,
                    id: currentOutputId,
                };
                config.outputs = config.outputs.filter(output => output.id !== currentOutputId);
                config.outputs.push(promoted);
            }
        });
    }

    private getLegacyFeatureId(
        device: Device,
        feature: ButtplugFeatureInformation,
    ): number | undefined {
        if (!this.selectBestMotionType(feature)) return undefined;
        const featureIndex = feature.FeatureIndex;
        const selected = Object.values(device.DeviceFeatures)
            .map((deviceFeature) => ({featureIndex: deviceFeature.FeatureIndex, motionType: this.selectBestMotionType(deviceFeature)}))
            .filter(item => item.motionType !== undefined)
            .sort((a, b) => a.featureIndex - b.featureIndex);
        const vibrateCount = selected.filter(deviceFeature => deviceFeature.motionType === 'vibrate').length;
        const linearCount = selected.filter(deviceFeature => deviceFeature.motionType === 'linear').length;
        let vibrateIndex = 0;
        let linearIndex = 0;
        let rotateIndex = 0;
        const legacyIndexByFeatureV3 = new Map<number, number>();
        for (const deviceFeature of selected) {
            const motionType = deviceFeature.motionType;
            if (motionType === 'vibrate') {
                legacyIndexByFeatureV3.set(deviceFeature.featureIndex, vibrateIndex++);
                continue;
            }
            if (motionType === 'linear') {
                legacyIndexByFeatureV3.set(deviceFeature.featureIndex, vibrateCount + linearIndex++);
                continue;
            }
            legacyIndexByFeatureV3.set(deviceFeature.featureIndex, vibrateCount + linearCount + rotateIndex++);
        }
        return legacyIndexByFeatureV3.get(featureIndex) ?? featureIndex;
    }

    private async getEarliestDeviceHistoryFirstSeen(): Promise<number | undefined> {
        const history = await this.backendDataService.getAllDeviceHistory();
        return Object.values(history).reduce<number | undefined>((minValue, entry) => {
            if (minValue === undefined || entry.firstSeen < minValue) return entry.firstSeen;
            return minValue;
        }, undefined);
    }

    private selectBestMotionType(rawFeature: ButtplugFeatureInformation): 'linear' | 'vibrate' | 'rotate' | undefined {
        const outputMap = rawFeature.Output;
        if (!outputMap) return undefined;
        if (outputMap.Vibrate) return 'vibrate';
        if (outputMap.Oscillate) return 'vibrate';
        if (outputMap.Rotate) return 'rotate';
        if (outputMap.PositionWithDuration) return 'linear';
        if (outputMap.Position) return 'linear';
        return undefined;
    }

    private isImportedSpecificOutputId(outputId: string): boolean {
        return outputId.startsWith(LegacyTxtConfigImportService.IMPORTED_ID_PREFIX)
            && outputId !== LegacyTxtConfigImportService.IMPORTED_ALL_ID;
    }
}
