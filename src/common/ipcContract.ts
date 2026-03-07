import {Config} from "./configTypes";
import {Result} from "./result";

export interface OutputDeviceInfo {
    id: string;
    name: string;
    connected: boolean;
    showLinearActuatorOptions: boolean;
    currentLevel: number;
    lastSources: number[];
}

export type OscqueryStatus =
    | 'success'
    | 'waitingForBulk'
    | 'searching'
    | 'failedToConnectHttpServer'
    | 'vrchatOscqueryBroadcastNotFound'
    | 'unknownError';

export type OscStatus =
    | 'connected'
    | 'socketStarting'
    | 'waitingForFirstPacket'
    | 'stale';

export interface SettingsStatePayload {
    outputs: OutputDeviceInfo[];
    intifaceConnected: boolean;
    vrchatConnected: boolean;
    hasSpsZones: boolean;
    outdatedAvatarDetected: boolean;
    vrchatOscEnabledWarning: boolean;
    vrchatSelfInteractWarning: boolean;
    vrchatEveryoneInteractWarning: boolean;
    vrchatOscStartupWarning: boolean;
    vrchatOscStartupWarningText?: string;
    vrchatLogsFound: boolean;
    oscqueryStatus: OscqueryStatus;
    oscStatus: OscStatus;
    mdnsWorking: boolean;
    ogbOscPort?: number;
    ogbOscqueryPort?: number;
    vrcOscPort?: number;
    vrcOscqueryPort?: number;
    detectedSpsPlugIds: string[];
    detectedSpsSocketIds: string[];
    detectedSpsTouchZoneIds: string[];
    importedAllDeletesAt?: number;
    detectedVrcConfigDir?: string;
}

export interface IpcInvokeMap {
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
