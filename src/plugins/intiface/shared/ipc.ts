export interface IntifaceSettingsState {
    intifaceConnected: boolean;
    intifaceConnectedAddress?: string;
    intifaceAddressOffSubnet: boolean;
}

declare module '../../../common/application/ipcContract' {
    interface SettingsStatePayload extends IntifaceSettingsState {}
}

