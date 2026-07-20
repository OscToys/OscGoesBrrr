import {contextBridge, ipcRenderer} from 'electron';
import type {IpcEventArgs, IpcEventChannel, IpcInvokeArgs, IpcInvokeChannel, IpcInvokeResult} from '../common/ipcContract';

contextBridge.exposeInMainWorld('ogbIpc', {
    invoke<C extends IpcInvokeChannel>(channel: C, ...args: IpcInvokeArgs<C>): Promise<IpcInvokeResult<C>> {
        return ipcRenderer.invoke(channel, ...args) as Promise<IpcInvokeResult<C>>;
    },
    on<C extends IpcEventChannel>(channel: C, listener: (...args: IpcEventArgs<C>) => void): () => void {
        const wrapped = (_event: unknown, ...args: unknown[]) => listener(...args as IpcEventArgs<C>);
        ipcRenderer.on(channel, wrapped);
        return () => ipcRenderer.off(channel, wrapped);
    },
});
