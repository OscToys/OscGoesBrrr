import type {InputModifier} from '../common/configTypes';
import clamp from '../common/clamp';

/** Positions and intensities are normalized; speed is measured in meters/second. */
export interface InputSample {
    id: string;
    value: number;
    kind: 'position' | 'intensity' | 'speed';
    /** Differentiate this position when Movement is selected. */
    movement?: boolean;
}

export interface ResolvedLink {
    inputs: readonly InputSample[];
    modifiers: readonly InputModifier[];
}

export interface LinkResult {
    output: number;
    backward: boolean;
}

/** Pure routing: the caller owns snapshots, timing, and history between updates. */
export function evaluateRoutes(
    links: readonly ResolvedLink[],
    previousInputs: ReadonlyMap<string, number>,
    elapsedMs: number,
    allowMovement: boolean,
) {
    const nextInputs = new Map<string, number>();
    const results = links.map(link => {
        let best: LinkResult = {output: 0, backward: false};
        for (const input of link.inputs) {
            const previous = previousInputs.get(input.id) ?? input.value;
            nextInputs.set(input.id, input.value);
            let value = input.value;
            let backward = false;
            if (allowMovement && input.kind !== 'speed' && input.movement) {
                const velocity = elapsedMs === 0 ? 0 : (value - previous) / elapsedMs * 1000;
                value = Math.abs(velocity) / 5;
                backward = velocity < 0;
            }
            const deadZone = link.modifiers.find(modifier => modifier.kind === 'deadZone');
            if (deadZone?.kind === 'deadZone') {
                if (deadZone.level >= 1) value = 0;
                else if (deadZone.level > 0) value = (value - deadZone.level) / (1 - deadZone.level);
            }
            const scale = link.modifiers.find(modifier => modifier.kind === 'scale');
            if (scale?.kind === 'scale') value *= scale.scale;
            if (value > best.output) best = {output: value, backward};
        }
        return best;
    });
    let strongest: LinkResult = {output: 0, backward: false};
    for (const result of results) {
        if (result.output > strongest.output) strongest = result;
    }
    return {links: results, output: {...strongest, output: clamp(strongest.output, 0, 1)}, nextInputs};
}
