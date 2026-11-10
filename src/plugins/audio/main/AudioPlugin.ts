import {Plugin, PluginService} from '../../../main/plugins/Plugin';
import type {LinkInputResolver} from '../../../main/sourceInputs';
import type {PluginContext} from '../../../main/plugins/PluginContext';

@PluginService()
export default class AudioPlugin extends Plugin {
    private level = 0;
    private receivedAt: number | undefined;

    override async start(context: PluginContext) {
        context.handleIpc('fft:status', level => this.receivedFft(level));
        // Repeat the capture state so a newly loaded renderer receives it too.
        const timer = setInterval(() => {
            const needed = context.getOutputs().some(output =>
                output.config?.links.some(link => link.kind === 'systemAudio') ?? false);
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
            if (link.kind !== 'systemAudio') return undefined;
            if (linear) return [];
            return [{id: String(index), value, kind: 'intensity'}];
        };
    }
}
