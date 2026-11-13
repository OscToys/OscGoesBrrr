import {getDefaultConfig} from '../../common/application/configuration';
import type {PluginContext} from './PluginContext';
import type {
    IpcEventChannel,
    IpcInvokeArgs,
    IpcInvokeChannel,
    IpcInvokeResult,
} from '../../common/application/ipcContract';

export function createPluginHost() {
    const outputs: {id: string; config: ReturnType<PluginContext['getOutputConfigs']>[number] | undefined}[] = [];
    const events: IpcEventChannel[] = [];
    const handlers = new Map<IpcInvokeChannel, unknown>();
    const host: Omit<PluginContext, 'onCleanup' | 'signal'> = {
        getConfig: getDefaultConfig,
        getOutputConfigs: () => outputs.flatMap(output => output.config ? [output.config] : []),
        send: (channel, ...args) => { events.push(channel); return true; },
        handleIpc: (channel, handler) => {
            if (handlers.has(channel)) throw new Error(`Duplicate handler: ${channel}`);
            handlers.set(channel, handler);
            return () => { handlers.delete(channel); };
        },
    };
    function invoke<C extends IpcInvokeChannel>(channel: C, ...args: IpcInvokeArgs<C>) {
        const handler = handlers.get(channel) as (...args: IpcInvokeArgs<C>) => IpcInvokeResult<C>;
        return handler(...args);
    }
    return {host, outputs, events, handlers, invoke};
}
