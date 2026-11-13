import type {OutputEndpoint} from './OutputEndpoint';
import {isOutputControlType} from './OutputEndpoint';
import type {OutputSettings} from '../common/configTypes';
import {planPosition, type PositionPlannerState} from './positionPlanner';
import {evaluateRoutes, type LinkResult, type ResolvedLink} from './routing';
import clamp from '../common/clamp';

export default class OutputController {
    private routedOutput: LinkResult = {output: 0, backward: false};
    private lastLinkValues: number[] = [];
    private lastSourceValues = new Map<string, number>();
    public lastLevel = 0;
    private lastPushTime = 0;
    private positionState: PositionPlannerState = {velocity: 0, lastActiveAt: 0};
    private lastMotionType: OutputEndpoint['type'];

    constructor(public readonly output: OutputEndpoint) {
        this.lastMotionType = output.type;
    }

    getLinkOutputs(inputs: readonly ResolvedLink[], timeDelta: number): LinkResult[] {
        const linear = this.output.type === 'linear';
        const supportedInputs = isOutputControlType(this.output.type) ? inputs : inputs.map(link => ({...link, inputs: []}));
        const result = evaluateRoutes(supportedInputs, this.lastSourceValues, timeDelta, !linear);
        this.lastSourceValues = result.nextInputs;
        this.lastLinkValues = result.links.map(link => link.output);
        this.routedOutput = result.output;
        return result.links;
    }

    update(inputs: readonly ResolvedLink[], settings: OutputSettings) {
        if (settings.enabled === false || !isOutputControlType(this.output.type)) {
            this.getLinkOutputs(inputs.map(link => ({...link, inputs: []})), 0);
            this.positionState = {velocity: 0, lastActiveAt: Date.now()};
            this.lastPushTime = Date.now();
            // Zero stops intensity/rotation. A position of zero would move a linear device, not disable it.
            if (this.output.type === 'vibrate' || this.output.type === 'rotate') this.output.setLevel(0);
            this.lastLevel = 0;
            return;
        }
        const modeChanged = this.lastMotionType !== this.output.type;
        if (modeChanged) {
            this.positionState = {...this.positionState, velocity: 0};
            this.lastSourceValues.clear();
            this.lastMotionType = this.output.type;
        }
        const now = Date.now();
        const timeDeltaReal = now - this.lastPushTime;
        const timeDelta = clamp(timeDeltaReal, 0, 250); // safety limited

        this.getLinkOutputs(inputs, timeDelta);
        let level = this.routedOutput.output;
        const backward = this.routedOutput.backward;

        if (this.output.type == 'linear') {
            const plan = planPosition(
                level,
                this.output.lastLevel,
                timeDelta,
                now,
                settings.linear,
                this.positionState,
                this.output.disableInterpolation,
            );
            if (modeChanged || this.output.lastLevel !== plan.position) {
                this.output.setLevel(plan.position, plan.duration);
            }
            this.positionState = plan.nextState;
        } else {
            level = clamp(level, 0, 1);

            if (this.output.type == 'rotate') {
                this.output.setLevel(level * (backward ? -1 : 1));
            } else {
                this.output.setLevel(level);
            }
        }

        this.lastLevel = this.output.lastLevel;
        this.lastPushTime = now;
    }

    getCurrentLevel() {
        return this.lastLevel;
    }

    getLastLinkValues() {
        return [...this.lastLinkValues];
    }
}
