import type {IntifaceDeviceFeatureSelection} from './IntifaceProtocol';
import type {DeviceHistoryItem} from '../../../main/services/backendDataTypes';

export interface IntifaceDeviceHistoryData {
    intiface: IntifaceDeviceFeatureSelection;
}

export function isIntifaceDeviceHistory(
    id: string,
    item: DeviceHistoryItem,
): item is DeviceHistoryItem & IntifaceDeviceHistoryData {
    return id.startsWith('intiface.') && 'intiface' in item;
}
