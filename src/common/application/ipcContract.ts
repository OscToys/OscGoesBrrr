import type * as Core from '../ipcContract';
import type {Config} from './configTypes';

export type {OutputDeviceInfo} from '../ipcContract';

/** Each plugin augments these contracts in its own shared module. */
export interface SettingsStatePayload extends Core.SettingsStatePayload {}
export interface IpcInvokeMap extends Core.IpcInvokeMap<Config> {}
export interface IpcEventMap extends Core.IpcEventMap<Config, SettingsStatePayload> {}

export type IpcInvokeChannel = keyof IpcInvokeMap;
export type IpcInvokeArgs<C extends IpcInvokeChannel> = IpcInvokeMap[C]['args'];
export type IpcInvokeResult<C extends IpcInvokeChannel> = IpcInvokeMap[C]['result'];
export type IpcEventChannel = keyof IpcEventMap;
export type IpcEventArgs<C extends IpcEventChannel> = IpcEventMap[C];
