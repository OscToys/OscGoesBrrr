import type {IpcEventArgs, IpcEventChannel, IpcInvokeArgs, IpcInvokeChannel, IpcInvokeResult} from '../common/ipcContract';

interface OgbIpcBridge {
    invoke<C extends IpcInvokeChannel>(channel: C, ...args: IpcInvokeArgs<C>): Promise<IpcInvokeResult<C>>;
    on<C extends IpcEventChannel>(channel: C, listener: (...args: IpcEventArgs<C>) => void): () => void;
}

declare global {
    interface Window {
        ogbIpc: OgbIpcBridge;
    }
}

export {};
