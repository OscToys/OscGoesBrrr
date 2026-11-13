import type {OutputEndpoint} from './OutputEndpoint';
import type {OutputFrame} from './OutputFrame';
import OutputController from './OutputController';
import {collectLinkInputs, type LinkInputResolver, type ResolveLinks} from './plugins/linkInputs';
import {InjectMany, Service} from 'typedi';
import {Plugin} from './plugins/Plugin';

@Service()
export default class Bridge {
    private readonly outputs = new Map<OutputEndpoint, OutputController>();
    private timer?: ReturnType<typeof setInterval>;

    constructor(
        @InjectMany(Plugin.token)
        private readonly plugins: Plugin[],
    ) {}

    start(): void {
        this.timer ??= setInterval(() => this.update(), 1000 / 15);
    }

    stop(): void {
        clearInterval(this.timer);
        this.timer = undefined;
    }

    private getFrames(): OutputFrame[] {
        const resolvers = new Map<string, LinkInputResolver>();
        for (const plugin of this.plugins) {
            const resolve = plugin.snapshot();
            if (resolve) resolvers.set(plugin.id, resolve);
        }
        const resolveLinks: ResolveLinks = (links, linear) => collectLinkInputs(links, linear, resolvers);
        return this.plugins.flatMap(plugin => Array.from(plugin.getOutputs(resolveLinks)));
    }

    private syncOutputs(frames: readonly OutputFrame[]) {
        const active = new Set(frames.map(frame => frame.output));
        for (const endpoint of this.outputs.keys()) {
            if (!active.has(endpoint)) this.outputs.delete(endpoint);
        }
        for (const endpoint of active) {
            if (!this.outputs.has(endpoint)) this.outputs.set(endpoint, new OutputController(endpoint));
        }
    }

    getOutputs() {
        this.syncOutputs(this.getFrames());
        return new Set(this.outputs.values());
    }

    update() {
        const frames = this.getFrames();
        this.syncOutputs(frames);
        let maxLevel = 0;
        for (const frame of frames) {
            const controller = this.outputs.get(frame.output)!;
            controller.update(frame.inputs, frame.settings);
            maxLevel = Math.max(maxLevel, controller.lastLevel);
        }
        for (const plugin of this.plugins) plugin.afterUpdate(maxLevel);
    }
}
