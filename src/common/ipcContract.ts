import {Config} from "./configTypes";
import {Result} from "./result";
import type {PluginIpcEventMap, PluginIpcInvokeMap, PluginSettingsState} from './plugins/contracts';
export type * from './plugins/contracts';

export interface OutputDeviceInfo {
    id: string;
    name: string;
    connected: boolean;
    showLinearActuatorOptions: boolean;
    supportsLinearPreference: boolean;
    currentLevel: number;
    lastLinkValues: number[];
}

export interface SettingsStatePayload extends PluginSettingsState {
    outputs: OutputDeviceInfo[];
    updateAvailable?: {
        version?: string;
        downloadUrl?: string;
        status: 'downloading' | 'installIpc' | 'download' | 'error';
    };
}

export interface IpcInvokeMap extends PluginIpcInvokeMap {
    'updater:install': {args: []; result: void};
    'config:request': {args: []; result: void};
    'config:reset': {args: []; result: void};
    'config:open': {args: []; result: string};
    'backendData:reset': {args: []; result: void};
    'backendData:open': {args: []; result: string};
    'settings-state:request': {args: []; result: void};
    'config:set': {args: [Config]; result: void};
    'log:history': {args: []; result: string[]};
}

export interface IpcEventMap extends PluginIpcEventMap {
    'log:line': [string];
    'config:changed': [Result<Config>];
    'settings-state:changed': [Result<SettingsStatePayload>];
}

export type IpcInvokeChannel = keyof IpcInvokeMap;
export type IpcInvokeArgs<C extends IpcInvokeChannel> = IpcInvokeMap[C]['args'];
export type IpcInvokeResult<C extends IpcInvokeChannel> = IpcInvokeMap[C]['result'];

export type IpcEventChannel = keyof IpcEventMap;
export type IpcEventArgs<C extends IpcEventChannel> = IpcEventMap[C];
