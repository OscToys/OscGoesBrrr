import {Result} from "./result";

export interface OutputDeviceInfo {
    plugin: string;
    id: string;
    name: string;
    connected: boolean;
    showLinearActuatorOptions: boolean;
    supportsLinearPreference: boolean;
    currentLevel: number;
    lastLinkValues: number[];
}

export interface SettingsStatePayload {
    outputs: OutputDeviceInfo[];
    updateAvailable?: {
        version?: string;
        downloadUrl?: string;
        status: 'downloading' | 'installIpc' | 'download' | 'error';
    };
}

export interface IpcInvokeMap<TConfig = unknown> {
    'updater:install': {args: []; result: void};
    'config:request': {args: []; result: void};
    'config:reset': {args: []; result: void};
    'config:open': {args: []; result: string};
    'backendData:reset': {args: []; result: void};
    'backendData:open': {args: []; result: string};
    'settings-state:request': {args: []; result: void};
    'config:set': {args: [TConfig]; result: void};
    'log:history': {args: []; result: string[]};
}

export interface IpcEventMap<TConfig = unknown, TSettings extends SettingsStatePayload = SettingsStatePayload> {
    'log:line': [string];
    'config:changed': [Result<TConfig>];
    'settings-state:changed': [Result<TSettings>];
}

export type IpcInvokeChannel = keyof IpcInvokeMap;
export type IpcInvokeArgs<C extends IpcInvokeChannel> = IpcInvokeMap[C]['args'];
export type IpcInvokeResult<C extends IpcInvokeChannel> = IpcInvokeMap[C]['result'];

export type IpcEventChannel = keyof IpcEventMap;
export type IpcEventArgs<C extends IpcEventChannel> = IpcEventMap[C];
