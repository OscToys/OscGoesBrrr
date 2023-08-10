declare module 'osc' {

    import {RemoteInfo} from "dgram";

    export class UDPPort {
        constructor(opts: {
            localAddress: string,
            localPort: number,
            remotePort?: number,
            metadata: boolean,
        });

        on(ev: 'ready', cb: () => void);
        on(ev: 'error', cb: (e: unknown) => void);
        on(ev: 'data', cb: (buffer: Buffer) => void);
        on(ev: 'message', cb: (message: OscMessage, timeTag: unknown, rinfo: RemoteInfo) => void);
        open();
        close();
        send(OscMessage);
    }

    interface OscMessage {
        address?: string;
        args?: OscArg[];
    }
    type OscArg = { type: "f"; value: number; }
        | { type: "s"; value: string; }
        | { type: "i"; value: number; }
        | { type: "b"; value: unknown; };

}
