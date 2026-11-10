import type {PluginContext} from './PluginContext';

/** Repeat asynchronous work without overlapping calls or rescheduling after shutdown. */
export function poll(
    context: PluginContext,
    delayMs: number,
    operation: () => Promise<void>,
    onError: (error: unknown) => void,
): void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    context.onCleanup(() => clearTimeout(timer));
    const run = async () => {
        if (context.signal.aborted) return;
        try { await operation(); } catch (error) { onError(error); }
        if (!context.signal.aborted) timer = setTimeout(run, delayMs);
    };
    void run();
}
