import type {Plugin} from './Plugin';
import type {PluginContext} from './PluginContext';

/** Owns startup ordering and the resources registered by plugins. */
export default class PluginRuntime {
    private cleanups: (() => void)[] = [];
    private stopped = false;
    private startup?: Promise<boolean>;
    private readonly controller = new AbortController();

    constructor(
        private readonly plugins: readonly Plugin[],
        private readonly host: Omit<PluginContext, 'onCleanup' | 'signal'>,
    ) {
        const ids = new Set<string>();
        for (const plugin of plugins) {
            if (!plugin.id || ids.has(plugin.id)) throw new Error(`Invalid or duplicate plugin ID: ${plugin.id}`);
            ids.add(plugin.id);
        }
    }

    start(): Promise<boolean> {
        return this.startup ??= this.startPlugins();
    }

    private async startPlugins(): Promise<boolean> {
        const onCleanup = (cleanup: () => void) => {
            if (this.stopped) cleanup();
            else this.cleanups.push(cleanup);
        };
        const context: PluginContext = {
            ...this.host,
            signal: this.controller.signal,
            onCleanup,
            handleIpc: (channel, handler) => {
                const dispose = this.host.handleIpc(channel, handler);
                let disposed = false;
                const cleanup = () => {
                    if (disposed) return;
                    disposed = true;
                    dispose();
                };
                onCleanup(cleanup);
                return cleanup;
            },
        };
        try {
            for (const plugin of this.plugins) {
                if (this.stopped) return false;
                await plugin.start(context);
            }
            return !this.stopped;
        } catch (error) {
            try {
                this.stop();
            } catch (cleanupError) {
                throw new AggregateError([error, cleanupError], 'Plugin startup and cleanup failed');
            }
            throw error;
        }
    }

    stop(): void {
        if (this.stopped) return;
        this.stopped = true;
        this.controller.abort();
        const errors: unknown[] = [];
        for (const cleanup of this.cleanups.splice(0).reverse()) {
            try { cleanup(); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, 'Plugin cleanup failed');
    }
}
