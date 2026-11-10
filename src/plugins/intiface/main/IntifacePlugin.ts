import {Plugin, PluginService} from '../../../main/plugins/Plugin';
import Intiface from './Intiface';
import type {OutputEndpoint} from '../../../main/OutputEndpoint';
import IntifaceSettings from './IntifaceSettings';
import type OutputController from '../../../main/OutputController';
import type {PluginContext} from '../../../main/plugins/PluginContext';

@PluginService()
export default class IntifacePlugin extends Plugin {
    override async start(context: PluginContext) {
        this.intiface.start(context);
    }

    override async settingsState(outputs: readonly OutputController[]) {
        return this.settings.getState(outputs);
    }
    constructor(
        private readonly intiface: Intiface,
        private readonly settings: IntifaceSettings,
    ) {
        super();
    }

    override getOutputs(): Iterable<OutputEndpoint> {
        return this.intiface.getDevices();
    }
}
