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
        hapticsDisabled: boolean;
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
        detectedVrcConfigDirs: string[];
    };
    detectedSpsPlugIds: string[];
    detectedSpsSocketIds: string[];
    detectedSpsTouchZoneIds: string[];
}

export interface VrchatSettingsState {
    vrchat: SettingsStateVrchat;
}

export interface VrchatIpcInvokeMap {
    'oscStatus:get': {args: []; result: string};
    'avatarParams:get': {args: []; result: Map<string, unknown>};
}
