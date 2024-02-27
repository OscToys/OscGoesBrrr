import {object, string, array, number, boolean, z, literal, union, discriminatedUnion} from 'zod';

export const RuleAction = discriminatedUnion("type", [
    object({type: literal('scale'), scale: z.number().default(1) }),
    object({type: literal('movement'), }),
]);

export const Rule = object({
    condition: string().default(''),
    action: RuleAction
});
export type Rule = z.infer<typeof Rule>;

export const Plugins = object({
    intiface: object({
        address: string().default(''),
        linear: object({
            minPosition: number().min(0).max(1).optional(),
            maxPosition: number().min(0).max(1).optional(),
            maxVelocity: number().min(0).optional(),
            maxAcceleration: number().min(0).optional(),
            restingPosition: number().min(0).max(1).optional(),
            restingTime: number().min(0).optional(),
            debugLog: boolean().default(false),
        }).optional()
    }).optional(),
    vrchat: object({
        proxy: array(object({
            address: string().default('')
        })).default([]),
        customSourceParams: array(object({
            name: string().default(''),
        })).default([]),
        allowSelfTouch: boolean().default(false),
        allowSelfPlug: boolean().default(false),
        maxLevelParam: string().optional(),
        resetOscConfigs: boolean().default(true),
    }).optional(),
    idle: object({
        level: number().min(0).max(1).default(0),
    }).optional(),
    audio: object({
        enabled: boolean().default(false),
    }).optional(),
    rules: object({
        rules: array(Rule).default([]),
    }).optional(),
}).default({});
export type Plugins = z.infer<typeof Plugins>;

export const Config = object({
    plugins: Plugins,
});
export type Config = z.infer<typeof Config>;
