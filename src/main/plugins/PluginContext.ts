import type {Config, OutputConfig} from '../../common/application/configTypes';
import type {
    IpcEventArgs,
    IpcEventChannel,
    IpcInvokeArgs,
    IpcInvokeChannel,
    IpcInvokeResult,
} from '../../common/application/ipcContract';

export interface PluginContext {
    readonly signal: AbortSignal;
    getConfig(): Readonly<Config>;
    getOutputConfigs(): readonly OutputConfig[];
    handleIpc<C extends IpcInvokeChannel>(
        channel: C,
        handler: (...args: IpcInvokeArgs<C>) => IpcInvokeResult<C> | Promise<IpcInvokeResult<C>>,
    ): () => void;
    send<C extends IpcEventChannel>(channel: C, ...args: IpcEventArgs<C>): boolean;
    onCleanup(cleanup: () => void): void;
}
