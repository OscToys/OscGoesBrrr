export type Result<TData, TError = string> =
    | {ok: true; data: TData}
    | {ok: false; error: TError};

