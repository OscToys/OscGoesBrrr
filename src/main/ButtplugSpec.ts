import type {tags} from "typia";

export type ButtplugUInt32 = number & tags.Type<"uint32">;
export type ButtplugInt32 = number & tags.Type<"int32">;

export type ButtplugInt32Range = [ButtplugInt32, ButtplugInt32];

export type ButtplugOutputCapabilities = {
    Value?: ButtplugInt32Range;
    Duration?: ButtplugInt32Range;
};

export interface ButtplugFeatureInformation {
    FeatureIndex: ButtplugUInt32;
    FeatureDescription: string;
    Output?: Partial<Record<ButtplugOutputType, ButtplugOutputCapabilities>> | null;
    [key: string]: unknown;
}

export interface Device {
    DeviceIndex: ButtplugUInt32;
    DeviceName: string;
    DeviceDisplayName?: string;
    DeviceFeatures: Record<string, ButtplugFeatureInformation>;
    [key: string]: unknown;
}

export interface IntifaceDeviceFeatureSelection {
    device: Device;
    feature: ButtplugFeatureInformation;
    selectedOutput: ButtplugOutputType;
}

export type ButtplugScalarOutputCommand = {
    Value: ButtplugInt32;
};

export type ButtplugDurationOutputCommand = {
    Value: ButtplugInt32;
    Duration: ButtplugUInt32;
};

export interface ButtplugOutputCommandMap {
    Vibrate: ButtplugScalarOutputCommand;
    Rotate: ButtplugScalarOutputCommand;
    Oscillate: ButtplugScalarOutputCommand;
    Constrict: ButtplugScalarOutputCommand;
    Position: ButtplugScalarOutputCommand;
    HwPositionWithDuration: ButtplugDurationOutputCommand;
}

export type ButtplugKnownOutputType = keyof ButtplugOutputCommandMap;

export type ButtplugOutputType = ButtplugKnownOutputType | (string & {});

export type ButtplugOutputCommand = {
    [K in ButtplugKnownOutputType]: { [P in K]: ButtplugOutputCommandMap[K] }
}[ButtplugKnownOutputType];

export interface ButtplugMessagePayload extends Record<string, unknown> {
    Id: ButtplugUInt32;
}

export interface ButtplugOkPayload extends ButtplugMessagePayload {}

export interface ButtplugDeviceListPayload extends ButtplugMessagePayload {
    Devices: Record<string, Device>;
}

export interface ButtplugErrorPayload extends ButtplugMessagePayload {
    ErrorMessage: string;
    ErrorCode: ButtplugUInt32;
}

export interface ButtplugOutputCmdPayload extends ButtplugMessagePayload {
    DeviceIndex: ButtplugUInt32;
    FeatureIndex: ButtplugUInt32;
    Command: ButtplugOutputCommand;
}

export interface ButtplugRequestServerInfoPayload extends ButtplugMessagePayload {
    ClientName: string;
    ProtocolVersionMajor: ButtplugUInt32;
    ProtocolVersionMinor: ButtplugUInt32;
}

export type ButtplugKnownMessagePayloadMap = {
    Ok: ButtplugOkPayload;
    Error: ButtplugErrorPayload;
    DeviceList: ButtplugDeviceListPayload;
    OutputCmd: ButtplugOutputCmdPayload;
    RequestServerInfo: ButtplugRequestServerInfoPayload;
    RequestDeviceList: ButtplugMessagePayload;
    StartScanning: ButtplugMessagePayload;
    StopScanning: ButtplugMessagePayload;
};

export type ButtplugKnownMessageType = keyof ButtplugKnownMessagePayloadMap;

export type ButtplugKnownMessageWithType = {
    [K in ButtplugKnownMessageType]: { type: K } & ButtplugKnownMessagePayloadMap[K]
}[ButtplugKnownMessageType];

export interface ButtplugUnknownMessageWithType {
    type: string;
    Id: ButtplugUInt32;
    [key: string]: unknown;
}

export type ButtplugMessageWithType = ButtplugKnownMessageWithType | ButtplugUnknownMessageWithType;

export type ButtplugSendMessageWithType = {
    [K in ButtplugKnownMessageType]: { type: K } & Omit<ButtplugKnownMessagePayloadMap[K], 'Id'>
}[ButtplugKnownMessageType];

export type ButtplugMessageEnvelope = {
    [K in ButtplugKnownMessageType]?: ButtplugKnownMessagePayloadMap[K];
} & {
    // Protocol is extensible; keep unknown message types valid.
    [messageType: string]: ButtplugMessagePayload;
};

export type ButtplugPacket = ButtplugMessageEnvelope[];
