import osc, {OscMessage} from 'osc';
import dgram from 'dgram';
import EventEmitter from "events"
import type TypedEmitter from "typed-emitter"

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
    private socket: osc.UDPPort | undefined;
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

    private openSocket() {
        let receivedOne = false;
        let oscPort = parseInt(this.configMap.get('osc.port') || '');
        if (isNaN(oscPort) || oscPort == 0) oscPort = 9001;
        this.log("Opening server on port " + oscPort);
        const udpPort = this.socket = new osc.UDPPort({
            localAddress: "127.0.0.1",
            localPort: oscPort,
            remotePort: 9000,
            metadata: true
        });
        udpPort.on('ready', () => {
            this.socketopen = true;
            this.log('<-', 'OPEN');
            this.log("Waiting for first message from OSC ...");
        });
        udpPort.on('error', (e: unknown) => {
            this.socketopen = false;
            this.log('<-', 'ERROR', e);
            this.delayRetry();
        });
        udpPort.on('data', (msg: Buffer) => {
            const proxyPort = this.configMap.get('osc.proxy');
            if (proxyPort) {
                for (let p of proxyPort.split(',')) {
                    const pNum = parseInt(p.trim());
                    if (!isNaN(pNum) && pNum > 0) this.udpClient.send(msg, pNum, '127.0.0.1');
                }
            }
        });
        udpPort.on('message', (oscMsg: OscMessage) => {
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
        udpPort.open();
    }

    delayRetry() {
        if (this.socket) {
            this.socket.close();
            this.socket = undefined;
        }
        clearTimeout(this.retryTimeout);
        this.retryTimeout = setTimeout(() => this.openSocket(), 1000);
    }

    send(paramName: string, value: number) {
        if (!this.socket || !this.socketopen) return;
        this.socket.send({
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
