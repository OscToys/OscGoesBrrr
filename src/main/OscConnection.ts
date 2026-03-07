import osc from 'osc';
import {OscMessage, UDPPort} from 'osc';
import dgram, {RemoteInfo} from 'dgram';
import {
    OSCQueryServer,
    OSCTypeSimple,
    OSCQAccess, OSCQueryDiscovery, DiscoveredService, type OSCMethodDescription,
} from "oscquery";
import portfinder from 'portfinder';
import {Service} from "typedi";
import MyAddressesService from "./services/MyAddressesService";
import ConfigService from "./services/ConfigService";
import LoggerService from "./services/LoggerService";
import VrchatOscqueryService from "./services/VrchatOscqueryService";
import http from "node:http";
import {Protocol} from "@homebridge/ciao";
import { getResponder } from "@homebridge/ciao";
import Bonjour from "bonjour-service";
import TypedEventEmitter from "../common/TypedEventEmitter";
import {OscStatus} from "../common/ipcContract";

type MyEvents = {
    add: (key: string, value: OscValue) => void,
    clear: () => void
}

@Service()
export default class OscConnection extends TypedEventEmitter<MyEvents> {
    private static readonly STALE_MS = 15_000;
    private readonly _entries = new Map<string,OscValue>();
    private recentlyRcvdOscCmds = 0;
    private hasBulkSinceAvatarChange = false;
    private isStale = true;
    private entriesVisible = false;
    private staleTimer?: NodeJS.Timeout;
    private readonly udpClient;
    private readonly logger;
    private oscQuery?: OSCQueryServer;
    private oscSocket?: UDPPort;
    socketopen = false;
    public port: number = 0;
    private shutdown: (()=>void)[] = [];
    private mdnsWorking = true;
    private mdnsWatchdogTimeout?: NodeJS.Timeout;
    private hasReceivedPacketSinceOpen = false;

    constructor(
        private myAddresses: MyAddressesService,
        private configService: ConfigService,
        private vrchatOscqueryService: VrchatOscqueryService,
        logger: LoggerService
    ) {
        super();

        this.logger = logger.get('oscLog');
        this.udpClient = dgram.createSocket('udp4');

        this.openSocket();

        setInterval(() => {
            if (!this.socketopen) return;
            if (this.recentlyRcvdOscCmds > 0) {
                this.logger.log("Received " + this.recentlyRcvdOscCmds + " OSC updates in the past 15 seconds");
                this.recentlyRcvdOscCmds = 0;
            }
        }, 15000);

        const mdns = new Bonjour();
        const mdnsBrowser = mdns.find({
            type: "oscjson",
            protocol: "tcp"
        });
        this.mdnsWatchdogTimeout = setTimeout(() => {
            this.logger.log("Mdns watchdog timed out! Mdns must not work on this machine. Reverting to legacy port 9001 mode.");
            this.mdnsWatchdogTimeout = undefined;
            this.mdnsWorking = false;
            this.openSocket();
        }, 5000);
        mdnsBrowser.on('up', service => {
            if (service.port != this.port) return;
            const ip = service.addresses?.[0];
            if (!ip) return;
            if (!this.myAddresses.has(ip)) return;
            this.logger.log("Mdns watchdog found own oscquery announcement");
            if (this.mdnsWatchdogTimeout) {
                clearTimeout(this.mdnsWatchdogTimeout);
                this.mdnsWatchdogTimeout = undefined;
            }
            mdns.destroy();
        })
    }

    public static parsePort(inputObj: string | undefined, defAddress: string, defPort: number): [string,number] {
        let input = (inputObj ?? '').trim();
        let outAddress = defAddress;
        let outPort = defPort;

        let stringPort = "";
        if (input.startsWith('[')) {
            const end = input.indexOf(']');
            if (end > 0) {
                outAddress = input.slice(1, end);
                const rest = input.slice(end + 1);
                if (rest.startsWith(':')) stringPort = rest.slice(1);
            } else if (input) {
                outAddress = input;
            }
        } else if (input.includes(':')) {
            const first = input.indexOf(':');
            const last = input.lastIndexOf(':');
            if (first === last) {
                outAddress = input.slice(0, first) || defAddress;
                stringPort = input.slice(first + 1);
            } else if (input) {
                // likely an unbracketed IPv6 host without explicit port
                outAddress = input;
            }
        } else if (input.match(/^\d+$/)) {
            stringPort = input;
        } else if (input) {
            outAddress = input;
        }

        const parsedPort = /^\d+$/.test(stringPort) ? parseInt(stringPort, 10) : NaN;
        if (!isNaN(parsedPort) && parsedPort > 0) outPort = parsedPort;

        return [outAddress, outPort];
    }

    private error(e: unknown) {
        this.logger.log('<-', 'ERROR', e);
    }

    private async openSocket() {
        try {
            await this.openSocketUnsafe();
        } catch (e) {
            this.error(e);
        }
    }

    private async openSocketUnsafe() {
        // Shutdown old service
        this.updateBulkAttempt = undefined;
        this.waitingForBulk = false;
        this.hasBulkSinceAvatarChange = false;
        this.isStale = true;
        this.hasReceivedPacketSinceOpen = false;
        this.clearStaleTimer();
        this.clearValues();
        for(const s of this.shutdown) { s(); }
        this.shutdown.length = 0;
        this.recomputeEntriesVisibility();

        let port = 9001;
        if (this.mdnsWorking) {
            port = this.port = await portfinder.getPortPromise({
                port: 33776,
            });
        }
        this.logger.log(`Selected port: ${port}`);

        if (this.mdnsWorking) {
            this.logger.log(`Starting OSCQuery handler...`);
            const oscQuery = this.oscQuery = new OSCQueryServer({
                httpPort: port,
                serviceName: "OGB"
            });
            this.shutdown.push(() => oscQuery.stop());
            oscQuery.addMethod("/avatar/change", { access: OSCQAccess.WRITEONLY });
            this.logger.log(`Started`);

            this.logger.log(`Starting OSCQuery HTTP server...`);
            const httpServer = http.createServer(oscQuery._httpHandler.bind(oscQuery));
            this.shutdown.push(() => httpServer.close());
            httpServer.on('error', e => this.logger.log(`HTTP server error ${e.stack}`));
            await new Promise<void>((resolve, reject) => {
                httpServer.listen(port, () => {
                    resolve();
                }).on('error', (err) => {
                    reject(err);
                });
            });
            this.logger.log(`Started on port ${port}`);

            this.logger.log(`Starting OSCQuery MDNS server...`);
            const mdns = getResponder();
            this.shutdown.push(() => mdns.shutdown());
            const mdnsService = mdns.createService({
                name: "OGB",
                type: "oscjson",
                port: port,
                protocol: "tcp" as Protocol,
            });
            // Do this async, in case it never returns, which seems to happen for some reason
            (async () => {
                try {
                    await mdnsService.advertise();
                    this.logger.log(`MDNS is advertising`);
                } catch (e) {
                    this.logger.log(`MDNS advertising error ${e instanceof Error ? e.stack : e}`);
                }
            })().then();
        }

        let receivedOne = false;

        this.logger.log(`Starting OSC server...`);
        const oscSocket = this.oscSocket = new osc.UDPPort({
            localAddress: '0.0.0.0',
            localPort: port,
            metadata: true
        });
        this.shutdown.push(() => oscSocket.close());
        oscSocket.on('ready', () => {
            this.socketopen = true;
            this.recentlyRcvdOscCmds = 0;
            this.logger.log('<-', 'OPEN');
            this.logger.log("Waiting for first message from OSC ...");
            this.recomputeEntriesVisibility();
        });
        this.shutdown.push(() => {
            this.socketopen = false;
            this.hasBulkSinceAvatarChange = false;
            this.isStale = true;
            this.clearStaleTimer();
            this.recomputeEntriesVisibility();
        });
        oscSocket.on('error', (e: unknown) => {
            // node osc throws errors for all sorts of invalid packets and things we often receive
            // that otherwise shouldn't be fatal to the socket. Just ignore them.
        });
        oscSocket.on('data', (msg: Buffer) => {
            const proxyTargets = this.configService.getCached().oscProxy;
            for (const target of proxyTargets) {
                const [address, port] = OscConnection.parsePort(target, '127.0.0.1', 0);
                if (port > 0) this.udpClient.send(msg, port, address);
            }
        });
        oscSocket.on('message', (oscMsg: OscMessage, timeTag: unknown, rinfo: RemoteInfo) => {
            const from = rinfo.address;
            if (!this.myAddresses.has(from)) {
                this.logger.log(`Received OSC packet from unknown address: ${from}`);
                return;
            }

            //this.log(`Received OSC packet from: ${from}`);
            if (!receivedOne) {
                receivedOne = true;
                this.hasReceivedPacketSinceOpen = true;
                if (this.mdnsWatchdogTimeout) {
                    clearTimeout(this.mdnsWatchdogTimeout);
                    this.mdnsWatchdogTimeout = undefined;
                }
                this.logger.log("Received an OSC message. We are probably connected.");
                this.updateBulk();
            }
            this.isStale = false;
            this.scheduleStaleTimer();
            this.recentlyRcvdOscCmds++;
            this.recomputeEntriesVisibility();

            const path = oscMsg.address;
            if (!path) return;

            if (path === '/avatar/change') {
                this.logger.log('<-', 'Avatar change');
                this.clearValues();
                this.hasBulkSinceAvatarChange = false;
                this.recomputeEntriesVisibility();
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
        if (isNew && this.entriesVisible) this.emit('add', param, value);
    }

    private parseParamFromPath(path: string) {
        if (path.startsWith('/avatar/parameters/')) {
            return path.substring('/avatar/parameters/'.length);
        }
        return undefined;
    }

    public waitingForBulk = false;
    private updateBulkAttempt: unknown;
    private async updateBulk() {
        this.waitingForBulk = true;
        const myAttempt = this.updateBulkAttempt = {};
        const isStillValid = () => this.updateBulkAttempt == myAttempt;
        while(true) {
            try {
                await this._updateBulk(isStillValid);
            } catch(e) {
                this.logger.log("Error fetching bulk info: " + e);
                await new Promise((r) => setTimeout(r, 100));
                if (isStillValid()) continue;
            }
            this.waitingForBulk = false;
            break;
        }
    }
    private async _updateBulk(isRequestStillValid: ()=>boolean) {
        const nodes = await this.vrchatOscqueryService.getBulk();
        if (!nodes) {
            throw new Error("VRChat OscQuery not discovered yet");
        }

        if (!isRequestStillValid()) return;
        for (const [key,value] of Object.entries(nodes)) {
            const param = this.parseParamFromPath(key);
            this.receivedParamValue(param, value, true);
        }
        console.log("OSCQ RECEIVED");
        this.hasBulkSinceAvatarChange = true;
        this.recomputeEntriesVisibility();
    }

    send(paramName: string, value: number) {
        if (!this.oscSocket || !this.socketopen) return;
        const sendAddr = this.vrchatOscqueryService.getOscAddress();
        if (!sendAddr) return;
        this.oscSocket.send({
            address: "/avatar/parameters/" + paramName,
            args: [
                {
                    type: "f",
                    value: value
                }
            ]
        }, sendAddr[0], sendAddr[1]);
    }

    clearDeltas() {
        for (const entry of this._entries.values()) {
            entry.clearDelta();
        }
    }

    entries() {
        if (!this.entriesVisible) return new Map<string, OscValue>();
        return this._entries;
    }

    isGameOpenAndActive() {
        return this.entriesVisible;
    }

    private clearStaleTimer() {
        if (this.staleTimer) clearTimeout(this.staleTimer);
        this.staleTimer = undefined;
    }

    private scheduleStaleTimer() {
        this.clearStaleTimer();
        this.staleTimer = setTimeout(() => {
            this.staleTimer = undefined;
            this.isStale = true;
            this.recomputeEntriesVisibility();
        }, OscConnection.STALE_MS);
    }

    private recomputeEntriesVisibility() {
        const nextVisible = Boolean(
            this.socketopen
            && !this.isStale
            && this.hasBulkSinceAvatarChange
        );
        if (nextVisible === this.entriesVisible) return;
        this.entriesVisible = nextVisible;
        this.emit('clear');
        if (!nextVisible) return;
        for (const [key, value] of this._entries.entries()) {
            this.emit('add', key, value);
        }
    }

    getStatusSnapshot(): {
        status: OscStatus;
        mdnsWorking: boolean;
        oscqueryWaitingForBulk: boolean;
    } {
        const oscqueryWaitingForBulk = this.waitingForBulk || !this.hasBulkSinceAvatarChange;
        if (!this.socketopen) {
            return {
                status: 'socketStarting',
                mdnsWorking: this.mdnsWorking,
                oscqueryWaitingForBulk,
            };
        }
        if (!this.hasReceivedPacketSinceOpen) {
            return {
                status: 'waitingForFirstPacket',
                mdnsWorking: this.mdnsWorking,
                oscqueryWaitingForBulk,
            };
        }
        if (this.isStale) {
            return {
                status: 'stale',
                mdnsWorking: this.mdnsWorking,
                oscqueryWaitingForBulk,
            };
        }
        return {
            status: 'connected',
            mdnsWorking: this.mdnsWorking,
            oscqueryWaitingForBulk,
        };
    }
}

type ValueEvents = {
    change: (oldValue: unknown, newValue: unknown) => void,
}

export class OscValue extends TypedEventEmitter<ValueEvents> {
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
