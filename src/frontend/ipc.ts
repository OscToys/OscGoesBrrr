import {IpcEventArgs, IpcEventChannel, IpcInvokeArgs, IpcInvokeChannel, IpcInvokeResult} from "../common/ipcContract";

export function invokeIpc<C extends IpcInvokeChannel>(channel: C, ...args: IpcInvokeArgs<C>): Promise<IpcInvokeResult<C>> {
    return window.ogbIpc.invoke(channel, ...args) as Promise<IpcInvokeResult<C>>;
}

export function onIpc<C extends IpcEventChannel>(channel: C, listener: (...args: IpcEventArgs<C>) => void): () => void {
    return window.ogbIpc.on(channel, listener);
}
