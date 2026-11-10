import {getDefaultLinearActuatorConfig, type OutputLinearActuatorConfig} from '../common/configTypes';
import clamp from '../common/clamp';

export interface PositionPlannerState {
    velocity: number;
    lastActiveAt: number;
}

/** Pure position planning, independent of source protocols and device commands. */
export function planPosition(
    input: number,
    currentPosition: number,
    elapsedMs: number,
    now: number,
    settings: Partial<OutputLinearActuatorConfig> | undefined,
    previous: Readonly<PositionPlannerState>,
) {
    const config = {...getDefaultLinearActuatorConfig(), ...settings};
    const seconds = elapsedMs / 1000;
    let maxVelocity = config.maxv;
    let maxAcceleration = config.maxa;
    let target = config.min + (1 - input) * (config.max - config.min);
    const lastActiveAt = input > 0 ? now : previous.lastActiveAt;
    if (input <= 0 && lastActiveAt < now - config.restingTime * 1000) {
        target = clamp(config.restingPos, 0, 1);
        maxAcceleration = 999;
        maxVelocity = clamp(maxVelocity, 0, 1);
    }
    target = clamp(target, 0, 1);
    const duration = Math.round(elapsedMs * config.durationMult);
    if (seconds <= 0) return {position: currentPosition, duration, nextState: {...previous, lastActiveAt}};

    const stoppingDistance = previous.velocity ** 2 / (2 * maxAcceleration);
    const stopPosition = currentPosition + (previous.velocity < 0 ? -1 : 1) * stoppingDistance;
    const accelerate = clamp(previous.velocity + maxAcceleration * seconds, -maxVelocity, maxVelocity);
    const decelerate = clamp(previous.velocity - maxAcceleration * seconds, -maxVelocity, maxVelocity);
    const acceleratedPosition = currentPosition + accelerate * seconds;
    const deceleratedPosition = currentPosition + decelerate * seconds;
    let velocity: number;
    if (target === acceleratedPosition) velocity = accelerate;
    else if (target === deceleratedPosition) velocity = decelerate;
    else if ((acceleratedPosition < target) !== (deceleratedPosition < target)) {
        velocity = (target - currentPosition) / seconds;
    } else velocity = target - stopPosition > 0 ? accelerate : decelerate;

    const unclampedPosition = currentPosition + velocity * seconds;
    const position = clamp(unclampedPosition, 0, 1);
    if (unclampedPosition !== position) velocity = 0;
    return {position, duration, nextState: {velocity, lastActiveAt}};
}
