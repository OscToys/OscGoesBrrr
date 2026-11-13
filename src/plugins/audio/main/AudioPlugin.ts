import {Plugin, PluginService} from '../../../main/plugins/Plugin';
import type {LinkInputResolver} from '../../../main/plugins/linkInputs';
import type {PluginContext} from '../../../main/plugins/PluginContext';
import {isAudioLink, PLUGIN_ID} from '../shared/config';

@PluginService()
export default class AudioPlugin extends Plugin {
    readonly id = PLUGIN_ID;
    private level = 0;
    private receivedAt: number | undefined;

    override async start(context: PluginContext) {
        context.handleIpc('fft:status', level => this.receivedFft(level));
        // Repeat the capture state so a newly loaded renderer receives it too.
        const timer = setInterval(() => {
            const needed = context.getOutputConfigs().some(output =>
                output.enabled !== false && output.links.some(link => link.enabled !== false && isAudioLink(link)));
            context.send(needed ? 'fft:start' : 'fft:stop');
        }, 1000);
        context.onCleanup(() => {
            clearInterval(timer);
            context.send('fft:stop');
        });
    }

    receivedFft(level: number) {
        if (!Number.isFinite(level) || level < 0 || level > 1) return;
        this.level = level;
        this.receivedAt = Date.now();
    }

    override snapshot(): LinkInputResolver {
        const fresh = this.receivedAt !== undefined && this.receivedAt > Date.now() - 1000;
        const value = fresh ? this.level : 0;
        return (link, index, linear) => {
            if (!isAudioLink(link)) return undefined;
            return {
                inputs: linear ? [] : [{id: String(index), value, kind: 'intensity'}],
                modifiers: link.mutators,
            };
        };
    }
}
