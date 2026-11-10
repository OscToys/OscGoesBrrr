import {Plugin, PluginService} from '../../../main/plugins/Plugin';
import type {LinkInputResolver} from '../../../main/sourceInputs';

@PluginService()
export default class ConstantPlugin extends Plugin {
    override snapshot(): LinkInputResolver {
        return (link, index, linear) => {
            if (link.kind !== 'constant') return undefined;
            if (linear) return [];
            return [{id: String(index), value: link.level, kind: 'intensity'}];
        };
    }
}
