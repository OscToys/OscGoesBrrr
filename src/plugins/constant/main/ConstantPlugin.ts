import {Plugin, PluginService} from '../../../main/plugins/Plugin';
import type {LinkInputResolver} from '../../../main/plugins/linkInputs';
import {isConstantLink, PLUGIN_ID} from '../shared/config';

@PluginService()
export default class ConstantPlugin extends Plugin {
    readonly id = PLUGIN_ID;
    override snapshot(): LinkInputResolver {
        return (link, index, linear) => {
            if (!isConstantLink(link)) return undefined;
            return {
                inputs: linear ? [] : [{id: String(index), value: link.level, kind: 'intensity'}],
                modifiers: [],
            };
        };
    }
}
