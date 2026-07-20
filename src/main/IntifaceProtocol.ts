import type {tags} from "typia";

export type IntifaceUInt32 = number & tags.Type<"uint32">;
export type IntifaceInt32 = number & tags.Type<"int32">;

export type IntifaceInt32Range = [IntifaceInt32, IntifaceInt32];

export type IntifaceOutputCapabilities = {
    Value?: IntifaceInt32Range;
    Duration?: IntifaceInt32Range;
};

export interface IntifaceFeatureInformation {
    FeatureIndex: IntifaceUInt32;
    FeatureDescription: string;
    Output?: Partial<Record<IntifaceOutputType, IntifaceOutputCapabilities>> | null;
    [key: string]: unknown;
}

export interface Device {
    DeviceIndex: IntifaceUInt32;
    DeviceName: string;
    DeviceDisplayName?: string;
    DeviceFeatures: Record<string, IntifaceFeatureInformation>;
    [key: string]: unknown;
}

export interface IntifaceDeviceFeatureSelection {
    device: Device;
    feature: IntifaceFeatureInformation;
    selectedOutput: IntifaceOutputType;
}

export type IntifaceScalarOutputCommand = {
    Value: IntifaceInt32;
};

export type IntifaceDurationOutputCommand = {
    Value: IntifaceInt32;
    Duration: IntifaceUInt32;
};

export interface IntifaceOutputCommandMap {
    Vibrate: IntifaceScalarOutputCommand;
    Rotate: IntifaceScalarOutputCommand;
    Oscillate: IntifaceScalarOutputCommand;
    Constrict: IntifaceScalarOutputCommand;
    Position: IntifaceScalarOutputCommand;
    HwPositionWithDuration: IntifaceDurationOutputCommand;
}

export type IntifaceKnownOutputType = keyof IntifaceOutputCommandMap;

export type IntifaceOutputType = IntifaceKnownOutputType | (string & {});

export type IntifaceOutputCommand = {
    [K in IntifaceKnownOutputType]: { [P in K]: IntifaceOutputCommandMap[K] }
}[IntifaceKnownOutputType];

export interface IntifaceMessagePayload extends Record<string, unknown> {
    Id: IntifaceUInt32;
}

export interface IntifaceOkPayload extends IntifaceMessagePayload {}

export interface IntifaceDeviceListPayload extends IntifaceMessagePayload {
    Devices: Record<string, Device>;
}

export interface IntifaceErrorPayload extends IntifaceMessagePayload {
    ErrorMessage: string;
    ErrorCode: IntifaceUInt32;
}

export interface IntifaceOutputCmdPayload extends IntifaceMessagePayload {
    DeviceIndex: IntifaceUInt32;
    FeatureIndex: IntifaceUInt32;
    Command: IntifaceOutputCommand;
}

export interface IntifaceRequestServerInfoPayload extends IntifaceMessagePayload {
    ClientName: string;
    ProtocolVersionMajor: IntifaceUInt32;
    ProtocolVersionMinor: IntifaceUInt32;
}

export type IntifaceKnownMessagePayloadMap = {
    Ok: IntifaceOkPayload;
    Error: IntifaceErrorPayload;
    DeviceList: IntifaceDeviceListPayload;
    OutputCmd: IntifaceOutputCmdPayload;
    RequestServerInfo: IntifaceRequestServerInfoPayload;
    RequestDeviceList: IntifaceMessagePayload;
    StartScanning: IntifaceMessagePayload;
    StopScanning: IntifaceMessagePayload;
};

export type IntifaceKnownMessageType = keyof IntifaceKnownMessagePayloadMap;

export type IntifaceKnownMessageWithType = {
    [K in IntifaceKnownMessageType]: { type: K } & IntifaceKnownMessagePayloadMap[K]
}[IntifaceKnownMessageType];

export interface IntifaceUnknownMessageWithType {
    type: string;
    Id: IntifaceUInt32;
    [key: string]: unknown;
}

export type IntifaceMessageWithType = IntifaceKnownMessageWithType | IntifaceUnknownMessageWithType;

export type IntifaceSendMessageWithType = {
    [K in IntifaceKnownMessageType]: { type: K } & Omit<IntifaceKnownMessagePayloadMap[K], 'Id'>
}[IntifaceKnownMessageType];

export type IntifaceMessageEnvelope = {
    [K in IntifaceKnownMessageType]?: IntifaceKnownMessagePayloadMap[K];
} & {
    // Protocol is extensible; keep unknown message types valid.
    [messageType: string]: IntifaceMessagePayload;
};

export type IntifacePacket = IntifaceMessageEnvelope[];
