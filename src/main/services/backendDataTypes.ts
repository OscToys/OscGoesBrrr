import type {PluginDeviceHistoryData} from '../plugins/deviceHistory';

export type DeviceHistoryItem = PluginDeviceHistoryData & {
    firstSeen: number;
    lastSeen: number;
};

export interface DeviceHistory {
    [id: string]: DeviceHistoryItem;
}

export interface BackendData {
    version: number;
    deviceHistory: DeviceHistory;
}

export function recordDeviceHistory(
    history: DeviceHistory,
    id: string,
    data: PluginDeviceHistoryData,
    now: number,
): void {
    history[id] = {
        ...data,
        firstSeen: history[id]?.firstSeen ?? now,
        lastSeen: now,
    };
}
