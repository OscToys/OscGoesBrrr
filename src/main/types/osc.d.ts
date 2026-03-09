declare module 'osc' {
    import {RemoteInfo} from 'dgram';

    export interface OscMessage {
        address?: string;
        args?: OscArg[];
    }

    export type OscArg =
        | { type: 'f'; value: number; }
        | { type: 's'; value: string; }
        | { type: 'i'; value: number; }
        | { type: 'b'; value: unknown; };

    export class UDPPort {
        constructor(opts: {
            localAddress: string,
            localPort: number,
            remotePort?: number,
            metadata: boolean,
        });

        on(ev: 'ready', cb: () => void): void;
        on(ev: 'error', cb: (e: unknown) => void): void;
        on(ev: 'data', cb: (buffer: Buffer) => void): void;
        on(ev: 'message', cb: (message: OscMessage, timeTag: unknown, rinfo: RemoteInfo) => void): void;
        open(): void;
        close(): void;
        send(message: OscMessage, address: string, port: number): void;
    }

    const osc: {
        UDPPort: typeof UDPPort;
    };
    export default osc;
}

