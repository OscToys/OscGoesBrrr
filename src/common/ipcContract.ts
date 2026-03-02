import {Config} from "./configTypes";
import {Result} from "./result";

export interface OutputDeviceInfo {
    id: string;
    name: string;
    connected: boolean;
    showLinearActuatorOptions: boolean;
}

export interface SettingsStatePayload {
    outputs: OutputDeviceInfo[];
    intifaceConnected: boolean;
    vrchatConnected: boolean;
    importedAllDeletesAt?: number;
    detectedVrcConfigDir?: string;
}

export interface IpcInvokeMap {
    'bioStatus:get': {args: []; result: string};
    'oscStatus:get': {args: []; result: string};
    'avatarParams:get': {args: []; result: Map<string, unknown>};
    'config:request': {args: []; result: void};
    'config:reset': {args: []; result: void};
    'config:open': {args: []; result: string};
    'backendData:reset': {args: []; result: void};
    'backendData:open': {args: []; result: string};
    'settings-state:request': {args: []; result: void};
    'config:set': {args: [Config]; result: void};
    'fft:status': {args: [number]; result: void};
    'log:history': {args: []; result: string[]};
}

export interface IpcEventMap {
    'fft:start': [];
    'fft:stop': [];
    'log:line': [string];
    'config:changed': [Result<Config>];
    'settings-state:changed': [Result<SettingsStatePayload>];
}

export type IpcInvokeChannel = keyof IpcInvokeMap;
export type IpcInvokeArgs<C extends IpcInvokeChannel> = IpcInvokeMap[C]['args'];
export type IpcInvokeResult<C extends IpcInvokeChannel> = IpcInvokeMap[C]['result'];

export type IpcEventChannel = keyof IpcEventMap;
export type IpcEventArgs<C extends IpcEventChannel> = IpcEventMap[C];
