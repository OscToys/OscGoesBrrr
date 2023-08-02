import {object, string, array, number, boolean, z} from 'zod';

export const DeviceConfig = object({
    scalar: object({
        minLevel: number().min(0).max(1),
        maxLevel: number().min(0).max(1),
    })
        .optional()
        .refine(v => !v || v.maxLevel >= v.minLevel, {
            message: 'Max level must be > min level'
        }),
    rotate: object({
        minLevel: number().min(0).max(1),
        maxLevel: number().min(0).max(1),
    })
        .optional()
        .refine(v => !v || v.maxLevel >= v.minLevel, {
            message: 'Max level must be > min level'
        }),
    linear: object({
        minPosition: number().min(0).max(1),
        maxPosition: number().min(0).max(1),
        maxVelocity: number().min(0),
        maxAcceleration: number().min(0),
        restingPosition: number().min(0).max(1),
        restingTime: number().min(0),
    })
        .optional()
        .refine(v => !v || v.maxPosition >= v.minPosition, {
            message: 'Max level must be > min level'
        }),
    sources: array(string()).default([]),
});
export type DeviceConfig = z.infer<typeof DeviceConfig>;

export const Config = object({
    intiface: object({
        address: string().default('')
    }).default({}),
    vrchat: object({
        receiveAddress: string().default(''),
        proxy: array(object({
            address: string().default('')
        })).default([]),
    }).default({}),
    devices: array(DeviceConfig).default([]),
});
export type Config = z.infer<typeof Config>;
