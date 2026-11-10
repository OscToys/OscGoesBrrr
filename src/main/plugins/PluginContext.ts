import type {Config, OutputConfig} from '../../common/configTypes';
import type {
    IpcEventArgs,
    IpcEventChannel,
    IpcInvokeArgs,
    IpcInvokeChannel,
    IpcInvokeResult,
} from '../../common/ipcContract';

export interface PluginContext {
    readonly signal: AbortSignal;
    getConfig(): Readonly<Config>;
    getOutputs(): readonly {id: string; config: OutputConfig | undefined}[];
    handleIpc<C extends IpcInvokeChannel>(
        channel: C,
        handler: (...args: IpcInvokeArgs<C>) => IpcInvokeResult<C> | Promise<IpcInvokeResult<C>>,
    ): () => void;
    send<C extends IpcEventChannel>(channel: C, ...args: IpcEventArgs<C>): boolean;
    onCleanup(cleanup: () => void): void;
}
