import osc from 'osc';
import type {OscMessage} from 'osc';
import dgram from 'dgram';
import EventEmitter from "events"
import type TypedEmitter from "typed-emitter"
import {
    OSCQueryServer,
    OSCTypeSimple,
    OSCQAccess,
} from "oscquery";
import portfinder from 'portfinder';

type MyEvents = {
    add: (key: string, value: OscValue) => void,
    clear: () => void
}

export default class OscConnection extends (EventEmitter as new () => TypedEmitter<MyEvents>) {
    private readonly _entries = new Map<string,OscValue>();
    private recentlyRcvdOscCmds = 0;
    lastReceiveTime = 0;
    private readonly configMap;
    private readonly udpClient;
    private readonly log;
    private oscQuery: OSCQueryServer | undefined;
    private oscSocket: osc.UDPPort | undefined;
    socketopen = false;
    private retryTimeout: ReturnType<typeof setTimeout> | undefined;

    constructor(
        logger: (...args: unknown[]) => void,
        configMap: Map<string,string>
    ) {
        super();

        this.log = logger;
        this.configMap = configMap;
        this.udpClient = dgram.createSocket('udp4');

        this.openSocket();

        setInterval(() => {
            if (this.recentlyRcvdOscCmds > 0) {
                this.log("Received " + this.recentlyRcvdOscCmds + " OSC updates in the past 15 seconds");
                this.recentlyRcvdOscCmds = 0;
            }
        }, 15000);
    }

    public static parsePort(inputObj: string | undefined, defAddress: string, defPort: number): [string,number] {
        let input = inputObj ?? '';
        let outAddress = defAddress;
        let outPort = defPort;
        if (input.includes(':')) {
            const split = input.split(':');
            outAddress = split[0]!;
            input = split[1]!;
        }
        const parsedPort = parseInt(input);
        if (!isNaN(parsedPort) && parsedPort > 0) outPort = parsedPort;
        return [outAddress, outPort];
    }

    private error(e: unknown) {
        this.log('<-', 'ERROR', e);
        this.delayRetry();
    }

    private async openSocket() {
        try {
            await this.openSocketUnsafe();
        } catch (e) {
            this.error(e);
        }
    }

    private async openSocketUnsafe() {
        const oscQuery = this.oscQuery = new OSCQueryServer({
            bindAddress: "127.0.0.1",
            serviceName: "OGB"
        });
        portfinder.setBasePort(Math.floor(Math.random()*100 + 43776));
        const hostInfo = await oscQuery.start();
        this.log("OscQuery started on port " + hostInfo.oscPort);
        const portNumber = hostInfo.oscPort!;

        let receivedOne = false;
        const [oscAddress, oscPort] = OscConnection.parsePort(
            this.configMap.get('osc.port'), '127.0.0.1', 9001);

        this.log(`Opening server on port ${oscAddress}:${oscPort}`);
        const oscSocket = this.oscSocket = new osc.UDPPort({
            localAddress: oscAddress,
            localPort: oscPort,
            remotePort: portNumber,
            metadata: true
        });
        oscSocket.on('ready', () => {
            this.socketopen = true;
            this.log('<-', 'OPEN');
            this.log("Waiting for first message from OSC ...");
        });
        oscSocket.on('error', (e: unknown) => this.error(e));
        oscSocket.on('data', (msg: Buffer) => {
            const proxyPort = this.configMap.get('osc.proxy');
            if (proxyPort) {
                for (let p of proxyPort.split(',')) {
                    const [address,port] = OscConnection.parsePort(p.trim(), '127.0.0.1', 0);
                    if (port > 0) this.udpClient.send(msg, port, address);
                }
            }
        });
        oscSocket.on('message', (oscMsg: OscMessage) => {
            if (!receivedOne) {
                receivedOne = true;
                this.log("Received an OSC message. We are probably connected.");
            }
            this.recentlyRcvdOscCmds++;
            this.lastReceiveTime = Date.now();

            const address = oscMsg.address;
            if (!address) return;

            if (address === '/avatar/change') {
                this.log('<-', 'Avatar change');
                this._entries.clear();
                this.emit('clear');
                return;
            }

            const arg = oscMsg.args?.[0];
            if (!arg) return;
            const rawValue = arg.value;

            if (address.startsWith('/avatar/parameters/')) {
                const key = address.substring('/avatar/parameters/'.length);
                let value = this._entries.get(key);
                let isNew = false;
                if (!value) {
                    value = new OscValue();
                    this._entries.set(key, value);
                    isNew = true;
                }
                value.receivedUpdate(rawValue);
                if (isNew) this.emit('add', key, value);
            }
        });

        // Open the socket.
        oscSocket.open();
    }

    delayRetry() {
        this.socketopen = false;
        if (this.oscSocket) {
            this.oscSocket.close();
            this.oscSocket = undefined;
        }
        if (this.oscQuery) {
            this.oscQuery.stop();
            this.oscQuery = undefined;
        }
        clearTimeout(this.retryTimeout);
        this.retryTimeout = setTimeout(() => this.openSocket(), 1000);
    }

    send(paramName: string, value: number) {
        if (!this.oscSocket || !this.socketopen) return;
        this.oscSocket.send({
            address: "/avatar/parameters/" + paramName,
            args: [
                {
                    type: "f",
                    value: value
                }
            ]
        });
    }

    clearDeltas() {
        for (const entry of this._entries.values()) {
            entry.clearDelta();
        }
    }

    entries() {
        return this._entries;
    }
}

type ValueEvents = {
    change: (oldValue: unknown, newValue: unknown) => void,
}

export class OscValue extends (EventEmitter as new () => TypedEmitter<ValueEvents>) {
    private value: unknown = undefined;
    private delta = 0;

    clearDelta() {
        this.delta = 0;
    }

    receivedUpdate(newValue: unknown) {
        const oldValue = this.value;
        if (typeof oldValue == 'number' && typeof newValue == 'number') {
            this.delta += Math.abs(newValue - oldValue);
        }
        this.value = newValue;
        this.emit('change', oldValue, newValue);
    }

    get() {
        return this.value;
    }

    getDelta() {
        return this.delta;
    }
}
