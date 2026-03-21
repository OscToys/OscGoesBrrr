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
    | 'searching'
    | 'failedToConnectHttpServer'
    | 'vrchatOscqueryBroadcastNotFound'
    | 'unknownError';

export type OscStatus =
    | 'connected'
    | 'socketStarting'
    | 'waitingForFirstPacket'
    | 'stale';

export interface SettingsStateVrchat {
    connected: boolean;
    diagnostics: {
        hasSpsZones: boolean;
        outdatedAvatarDetected: boolean;
        oscEnabled: boolean;
        selfInteract: boolean;
        everyoneInteract: boolean;
        loggingFull: boolean;
        oscStartup: boolean;
        oscStartupText?: string;
        ogbOscPort?: number;
        ogbOscqueryPort?: number;
        vrcOscPort?: number;
        vrcOscqueryPort?: number;
        oscStatus: OscStatus;
        oscqueryStatus: OscqueryStatus;
        oscqueryWaitingForBulk: boolean;
        logsFound: boolean;
        detectedVrcConfigDir?: string;
    };
    detectedSpsPlugIds: string[];
    detectedSpsSocketIds: string[];
    detectedSpsTouchZoneIds: string[];
}

export interface SettingsStatePayload {
    outputs: OutputDeviceInfo[];
    intifaceConnected: boolean;
    intifaceAddressOffSubnet: boolean;
    updateAvailable?: {
        version?: string;
        downloadUrl?: string;
        status: 'downloading' | 'installIpc' | 'download' | 'error';
    };
    vrchat: SettingsStateVrchat;
    importedDeletesAt?: number;
}

export interface IpcInvokeMap {
    'oscStatus:get': {args: []; result: string};
    'avatarParams:get': {args: []; result: Map<string, unknown>};
    'updater:install': {args: []; result: void};
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
