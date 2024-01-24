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

export const Config = object({
    outputs: object({
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
        }).default({}),
    }).default({}),

    sources: object({
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
            keepOscConfigs: boolean().default(false),
        }).default({}),
        audio: object({
            enabled: boolean().default(false),
        }).default({}),
    }).default({}),

    rules: array(Rule).default([]),
});
export type Config = z.infer<typeof Config>;
