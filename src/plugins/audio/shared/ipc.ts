export interface AudioIpcInvokeMap {
    'fft:status': {args: [number]; result: void};
}

export interface AudioIpcEventMap {
    'fft:start': [];
    'fft:stop': [];
}

declare module '../../../common/application/ipcContract' {
    interface IpcInvokeMap extends AudioIpcInvokeMap {}
    interface IpcEventMap extends AudioIpcEventMap {}
}
