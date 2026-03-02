import {ipcMain} from "electron";
import {IpcInvokeArgs, IpcInvokeChannel, IpcInvokeResult} from "../common/ipcContract";

export function handleIpc<C extends IpcInvokeChannel>(
    channel: C,
    handler: (...args: IpcInvokeArgs<C>) => IpcInvokeResult<C> | Promise<IpcInvokeResult<C>>,
) {
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
        return await handler(...(args as IpcInvokeArgs<C>));
    });
}
