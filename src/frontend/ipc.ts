import {ipcRenderer} from "electron";
import {IpcEventArgs, IpcEventChannel, IpcInvokeArgs, IpcInvokeChannel, IpcInvokeResult} from "../common/ipcContract";

export function invokeIpc<C extends IpcInvokeChannel>(channel: C, ...args: IpcInvokeArgs<C>): Promise<IpcInvokeResult<C>> {
    return ipcRenderer.invoke(channel, ...args) as Promise<IpcInvokeResult<C>>;
}

export function onIpc<C extends IpcEventChannel>(channel: C, listener: (...args: IpcEventArgs<C>) => void): () => void {
    const wrapped = (_event: unknown, ...args: unknown[]) => {
        listener(...(args as IpcEventArgs<C>));
    };
    ipcRenderer.on(channel, wrapped);
    return () => {
        ipcRenderer.off(channel, wrapped);
    };
}
