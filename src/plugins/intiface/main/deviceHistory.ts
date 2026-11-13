import type {IntifaceDeviceFeatureSelection} from './IntifaceProtocol';
import type {DeviceHistoryItem} from '../../../main/services/backendDataTypes';

export interface IntifaceDeviceHistoryData {
    intiface: IntifaceDeviceFeatureSelection;
}

declare module '../../../main/plugins/deviceHistory' {
    interface PluginDeviceHistoryData {
        intiface?: IntifaceDeviceFeatureSelection;
    }
}

export function isIntifaceDeviceHistory(
    id: string,
    item: DeviceHistoryItem,
): item is DeviceHistoryItem & IntifaceDeviceHistoryData {
    return id.startsWith('intiface.') && 'intiface' in item;
}
