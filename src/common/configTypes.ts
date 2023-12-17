import {object, string, array, number, boolean, z, literal, union, discriminatedUnion} from 'zod';

export const RuleCondition = discriminatedUnion("type", [
    object({ type: literal("tag"), tag: string().default('') }),
    object({ type: literal("notTag"), tag: string().default('') }),
]);
export type RuleCondition = z.infer<typeof RuleCondition>;

export const RuleAction = discriminatedUnion("type", [
    object({type: literal('scale'), scale: z.coerce.number().default(1) }),
    object({type: literal('movement'), }),
]);

export const Rule = object({
    conditions: array(RuleCondition).default([]),
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
