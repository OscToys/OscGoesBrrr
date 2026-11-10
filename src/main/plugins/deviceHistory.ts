import type {IntifaceDeviceHistoryData} from '../../plugins/intiface/main/deviceHistory';

// Extend this union as plugins add persisted device records. Keep the schema explicit.
export type PluginDeviceHistoryData = IntifaceDeviceHistoryData;
