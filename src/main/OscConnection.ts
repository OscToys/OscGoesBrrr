import osc from 'osc';
import type {OscMessage} from 'osc';
import dgram, {type RemoteInfo} from 'dgram';
import EventEmitter from "events"
import type TypedEmitter from "typed-emitter"
import {
    OSCQueryServer,
    OSCTypeSimple,
    OSCQAccess, OSCQueryDiscovery, DiscoveredService, type OSCMethodDescription,
} from "oscquery";
import portfinder from 'portfinder';
import * as os from "os";

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
    private lastPacket: number = 0;
    public port: number = 0;
    private myAddresses = new Set<string>();

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
            if (!this.socketopen) return;
            if (this.recentlyRcvdOscCmds > 0) {
                this.log("Received " + this.recentlyRcvdOscCmds + " OSC updates in the past 15 seconds");
                this.recentlyRcvdOscCmds = 0;
            }
            if (this.lastPacket < Date.now() - 1000*15) {
                this.log("Haven't received a packet in a while. Restarting to randomize port.");
                this.delayRetry();
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
        const port = this.port = await portfinder.getPortPromise({
            port: Math.floor(Math.random()*10000 + 33776),
        });
        this.log(`Selected port: ${port}`);

        this.log(`Starting OSCQuery server...`);
        const oscQuery = this.oscQuery = new OSCQueryServer({
            httpPort: port,
            serviceName: "OGB"
        });
        oscQuery.addMethod("/avatar/change", { access: OSCQAccess.WRITEONLY });
        const hostInfo = await oscQuery.start();
        this.log("OscQuery started on port " + hostInfo.oscPort);

        let receivedOne = false;

        const myAddresses = this.myAddresses = new Set(
            Object.values(os.networkInterfaces())
            .flatMap(infs => infs)
            .map(inf => inf?.address)
            .filter(address => address != undefined)
            .map(address => address!)
        );

        this.log(`Starting OSC server...`);
        const oscSocket = this.oscSocket = new osc.UDPPort({
            localAddress: '0.0.0.0',
            localPort: port,
            metadata: true
        });
        oscSocket.on('ready', () => {
            this.socketopen = true;
            this.recentlyRcvdOscCmds = 0;
            this.lastPacket = Date.now();
            this.log('<-', 'OPEN');
            this.log("Waiting for first message from OSC ...");
        });
        oscSocket.on('error', (e: unknown) => {
            // node osc throws errors for all sorts of invalid packets and things we often receive
            // that otherwise shouldn't be fatal to the socket. Just ignore them.
        });
        oscSocket.on('data', (msg: Buffer) => {
            const proxyPort = this.configMap.get('osc.proxy');
            if (proxyPort) {
                for (let p of proxyPort.split(',')) {
                    const [address,port] = OscConnection.parsePort(p.trim(), '127.0.0.1', 0);
                    if (port > 0) this.udpClient.send(msg, port, address);
                }
            }
        });
        oscSocket.on('message', (oscMsg: OscMessage, timeTag: unknown, rinfo: RemoteInfo) => {
            const from = rinfo.address;
            if (!myAddresses.has(from)) {
                //this.log(`Received OSC packet from unknown address: ${from}`);
                return;
            }

            //this.log(`Received OSC packet from: ${from}`);
            if (!receivedOne) {
                receivedOne = true;
                this.log("Received an OSC message. We are probably connected.");
                this.updateBulk();
            }
            this.lastPacket = Date.now();
            this.recentlyRcvdOscCmds++;
            this.lastReceiveTime = Date.now();

            const path = oscMsg.address;
            if (!path) return;

            if (path === '/avatar/change') {
                this.log('<-', 'Avatar change');
                this.clearValues();
                this.updateBulk();
                return;
            }

            const param = this.parseParamFromPath(path);
            this.receivedParamValue(param, oscMsg.args?.[0]?.value, false);
        });

        // Open the socket.
        oscSocket.open();
    }

    private clearValues() {
        this._entries.clear();
        this.emit('clear');
    }

    private receivedParamValue(param: string | undefined, rawValue: unknown, onlyUseIfNew: boolean) {
        if (param === undefined) return;
        if (rawValue === undefined) return;
        let value = this._entries.get(param);
        let isNew = false;
        if (!value) {
            value = new OscValue();
            this._entries.set(param, value);
            isNew = true;
        } else if (onlyUseIfNew) {
            return;
        }
        value.receivedUpdate(rawValue);
        if (isNew) this.emit('add', param, value);
    }

    private parseParamFromPath(path: string) {
        if (path.startsWith('/avatar/parameters/')) {
            return path.substring('/avatar/parameters/'.length);
        }
        return undefined;
    }

    public waitingForBulk = false;
    private updateBulkAttempt: unknown;
    private sendAddress: string | undefined;
    private sendPort: number | undefined;
    private async updateBulk() {
        this.waitingForBulk = true;
        const myAttempt = this.updateBulkAttempt = {};
        const isStillValid = () => this.updateBulkAttempt == myAttempt;
        while(true) {
            try {
                await this._updateBulk(isStillValid);
            } catch(e) {
                this.log("Error fetching bulk info: " + e);
                if (isStillValid()) continue;
            }
            this.waitingForBulk = false;
            break;
        }
    }
    private async _updateBulk(isRequestStillValid: ()=>boolean) {
        const discovery = new OSCQueryDiscovery();
        discovery.start();
        let found;
        try {
            found = await new Promise<[string,number,OSCMethodDescription[]]>((resolve, reject) => {
                discovery.on('up', (service: DiscoveredService) => {
                    if (!service.hostInfo.name?.startsWith("VRChat-Client")) return;
                    if (!this.myAddresses.has(service.address)) return;
                    console.log(`FOUND OSCQUERY ${service.address} ${service.port}`);
                    resolve([service.hostInfo.oscIp??"", service.hostInfo.oscPort??1, service.flat()]);
                });
                setTimeout(() => reject(new Error("Timed out")), 10000);
            });
        } finally {
            discovery.stop();
        }

        const [ip,port,nodes] = found;
        if (!isRequestStillValid()) return;
        this.sendAddress = ip;
        this.sendPort = port;
        for (const node of nodes) {
            const param = this.parseParamFromPath(node.full_path ?? '');
            this.receivedParamValue(param, node.arguments?.[0]?.value, true);
        }
    }

    delayRetry() {
        this.socketopen = false;
        this.updateBulkAttempt = undefined;
        this.waitingForBulk = false;
        this.clearValues();
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
        if (!this.oscSocket || !this.socketopen || !this.sendAddress || !this.sendPort) return;
        this.oscSocket.send({
            address: "/avatar/parameters/" + paramName,
            args: [
                {
                    type: "f",
                    value: value
                }
            ]
        }, this.sendAddress, this.sendPort);
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
