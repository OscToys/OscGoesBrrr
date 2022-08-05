import {t} from "../common/decodeType";

export const Device = t.intersection([
    t.type({
        DeviceIndex: t.number,
        DeviceName: t.string
    }),
    t.partial({
        DeviceMessages: t.partial({
            VibrateCmd: t.partial({ FeatureCount: t.number }),
            LinearCmd: t.partial({ FeatureCount: t.number }),
            RotateCmd: t.partial({ FeatureCount: t.number }),
        })
    }),
]);
export type Device = t.TypeOf<typeof Device>;
export const ButtplugMessage = t.partial({
    Ok: t.type({
        Id: t.number
    }),
    DeviceRemoved: t.type({
        DeviceIndex: t.number
    }),
    DeviceAdded: Device,
    DeviceList: t.type({
        Devices: t.array(Device)
    }),
    VibrateCmd: t.type({
        DeviceIndex: t.number,
        Speeds: t.array(t.type({
            Index: t.number,
            Speed: t.number,
        }))
    }),
    LinearCmd: t.type({
        DeviceIndex: t.number,
        Vectors: t.array(t.type({
            Index: t.number,
            Duration: t.number,
            Position: t.number,
        }))
    }),
    RotateCmd: t.type({
        DeviceIndex: t.number,
        Rotations: t.array(t.type({
            Index: t.number,
            Speed: t.number,
            Clockwise: t.boolean,
        }))
    }),
    RequestServerInfo: t.type({
        ClientName: t.string,
        MessageVersion: t.number,
    }),
    RequestDeviceList: t.type({}),
    StartScanning: t.type({}),
    StopScanning: t.type({}),
});
export type ButtplugMessage = t.TypeOf<typeof ButtplugMessage>;
export const ButtplugPacket = t.array(ButtplugMessage);
export type ButtplugPacket = t.TypeOf<typeof ButtplugPacket>;
export type ButtplugMessageForType<T extends string> =
    T extends keyof ButtplugMessage ? (ButtplugMessage[T] & { type: T }) : { type: T };
export type ButtplugMessageWithType = ButtplugMessageForType<keyof ButtplugMessage>;
