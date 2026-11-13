import {Plugin, PluginService} from '../../../main/plugins/Plugin';
import Intiface from './Intiface';
import type {OutputFrame} from '../../../main/OutputFrame';
import type {ResolveLinks} from '../../../main/plugins/linkInputs';
import ConfigService from '../../../main/services/ConfigService';
import {getOutput, PLUGIN_ID} from '../shared/config';
import IntifaceSettings from './IntifaceSettings';
import type OutputController from '../../../main/OutputController';
import type {PluginContext} from '../../../main/plugins/PluginContext';

@PluginService()
export default class IntifacePlugin extends Plugin {
    readonly id = PLUGIN_ID;
    override async start(context: PluginContext) {
        this.intiface.start(context);
    }

    override async settingsState(outputs: readonly OutputController[]) {
        return this.settings.getState(outputs);
    }
    constructor(
        private readonly intiface: Intiface,
        private readonly settings: IntifaceSettings,
        private readonly config: ConfigService,
    ) {
        super();
    }

    override *getOutputs(resolve: ResolveLinks): Iterable<OutputFrame> {
        for (const output of this.intiface.getDevices()) {
            const config = getOutput(this.config.getCached(), output.id);
            yield {
                output,
                inputs: resolve(config?.links ?? [], output.type === 'linear'),
                settings: {enabled: config?.enabled, linear: config?.linear},
            };
        }
    }

    override *getOutputConfigs() {
        for (const output of this.intiface.getDevices()) {
            const config = getOutput(this.config.getCached(), output.id);
            if (config) yield config;
        }
    }
}
