export interface AudioIpcInvokeMap {
    'fft:status': {args: [number]; result: void};
}

export interface AudioIpcEventMap {
    'fft:start': [];
    'fft:stop': [];
}
