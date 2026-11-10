import type {OutputEndpoint} from './OutputEndpoint';
import OutputController from './OutputController';
import ConfigService from "./services/ConfigService";
import {getDefaultOutput} from "../common/configTypes";
import {collectLinkInputs} from './sourceInputs';
import {InjectMany, Service} from "typedi";
import {Plugin} from './plugins/Plugin';

@Service()
export default class Bridge {
    private outputs = new Set<OutputController>();
    private timer?: ReturnType<typeof setInterval>;

    constructor(
        private configService: ConfigService,
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

    getOutputs() {
        const endpoints = new Set<OutputEndpoint>();
        for (const plugin of this.plugins) {
            for (const endpoint of plugin.getOutputs()) endpoints.add(endpoint);
        }
        const existing = new Set<OutputEndpoint>();
        for (const controller of this.outputs) {
            if (!endpoints.has(controller.output)) this.outputs.delete(controller);
            else existing.add(controller.output);
        }
        for (const endpoint of endpoints) {
            if (!existing.has(endpoint)) this.outputs.add(new OutputController(endpoint));
        }
        return this.outputs;
    }

    update() {
        let maxLevel = 0;
        const resolvers = this.plugins.flatMap(plugin => {
            const resolve = plugin.snapshot();
            return resolve ? [resolve] : [];
        });
        for (const output of this.getOutputs()) {
            const config = {
                ...getDefaultOutput(),
                id: output.output.id,
                ...this.configService.getOutput(output.output.id),
            };
            const inputs = collectLinkInputs(
                config.links,
                output.output.type === 'linear',
                resolvers,
            );
            output.update(inputs, config);
            maxLevel = Math.max(maxLevel, output.lastLevel);
        }

        for (const plugin of this.plugins) plugin.afterUpdate(maxLevel, this.configService.getCached());
    }

}
