import MyAddressesService from "./MyAddressesService";
import LoggerService from "./LoggerService";
import fsPlain from "fs";
import * as readline from "node:readline/promises";
import Bonjour, {type Browser} from "bonjour-service";
import {Service} from "typedi";
import type {Service as BounjourService} from "bonjour-service";
import got from "got";
import typia from "typia";
import VrchatLogFinder from "./VrchatLogFinder";
import {OscqueryStatus} from "../../common/ipcContract";

interface HostInfo {
    NAME: string;
    OSC_IP: string;
    OSC_PORT: number;
}

interface OscQueryValueNode {
    FULL_PATH: string;
    VALUE: unknown[];
}

/** Finds and keeps track of the local VRChat OSCQ service address */
@Service()
export default class VrchatOscqueryService {
    private readonly logger;

    private oscqAddress?: string;
    private oscqPort?: number;
    private oscAddress?: string;
    private oscPort?: number;
    private mdnsBrowser: Browser;
    private status: OscqueryStatus = 'searching';
    private logsFound = false;

    constructor(
        private myAddress: MyAddressesService,
        private logFinder: VrchatLogFinder,
        logger: LoggerService
    ) {
        this.logger = logger.get("vrcOscQuery");
        const serviceLogger = this.logger;

        const mdns = new Bonjour();
        this.mdnsBrowser = mdns.find({
            type: "oscjson",
            protocol: "tcp"
        });

        (async () => {
            while(true) {
                try {
                    await this.rescan();
                } catch (e) {
                    serviceLogger.log("Error while rescanning OSCQuery", e instanceof Error ? e.stack : e);
                    this.status = 'unknownError';
                }
                await new Promise(r => setTimeout(r, 5000));
            }
        })();
    }

    async rescan() {
        this.mdnsBrowser.update();

        if (this.oscqAddress && this.oscqPort) {
            let stillGood = false;
            try {
                const hostInfo = await this.getHostInfo(this.oscqAddress, this.oscqPort);
                stillGood = hostInfo !== undefined && this.isVrchatHostInfo(hostInfo);
            } catch(e) {}
            if (stillGood) {
                this.status = 'success';
                return;
            }
            // Intentionally keep the last working OSC/OSCQuery endpoints cached even after a failed probe.
            // VRChat discovery is flaky on some systems, and continuing to retry the last known good address
            // is better than clearing it and temporarily having nothing to talk to.
        }

        this.logger.log("Scanning for VRC OscQuery ...");
        if (this.status !== 'failedToConnectHttpServer') {
            this.status = 'searching';
        }
        let sawHttpFailure = false;
        let hadCandidate = false;
        for (const entry of (this.mdnsBrowser.services as BounjourService[])) {
            if (entry.protocol != 'tcp') continue;
            const ip = entry.addresses?.[0];
            const port = entry.port;
            if (!ip) continue;
            this.logger.log(`Checking MDNS entry: ${ip}:${port}`);
            if (!this.myAddress.has(ip)) {
                this.logger.log(`Skipping (unknown origin)`);
                continue;
            }
            if (ip != '127.0.0.1') {
                hadCandidate = true;
                const loopbackStatus = await this.checkPort('127.0.0.1', port);
                if (loopbackStatus === 'success') return;
                if (loopbackStatus === 'httpError') sawHttpFailure = true;
            }
            hadCandidate = true;
            const entryStatus = await this.checkPort(ip, port);
            if (entryStatus === 'success') return;
            if (entryStatus === 'httpError') sawHttpFailure = true;
        }

        this.logger.log("Checking vrchat logs for oscquery port ...");
        const {port: portFromLogs, logsFound} = await this.getOscqueryPortFromLogs();
        this.logsFound = logsFound;
        if (portFromLogs) {
            this.logger.log(`Found port ${portFromLogs} in logs`);
            hadCandidate = true;
            const logPortStatus = await this.checkPort('127.0.0.1', portFromLogs);
            if (logPortStatus === 'success') return;
            if (logPortStatus === 'httpError') sawHttpFailure = true;
        } else {
            this.logger.log('Could not find port in logs');
        }

        if (sawHttpFailure) {
            this.status = 'failedToConnectHttpServer';
        } else if (this.status === 'failedToConnectHttpServer') {
            // Keep this warning sticky until we successfully reconnect.
            return;
        } else if (hadCandidate) {
            this.status = 'vrchatOscqueryBroadcastNotFound';
        } else {
            this.status = 'searching';
        }
    }

    async getHostInfo(ip: string, port: number): Promise<HostInfo | undefined> {
        const json = await got({
            url: `http://${ip}:${port}/?HOST_INFO`,
            timeout: { request: 5000 }
        }).json();
        if (!typia.is<HostInfo>(json)) {
            return undefined;
        }
        return json;
    }

    async checkPort(ip: string, port: number): Promise<'success' | 'notVrchat' | 'httpError'> {
        try {
            const hostInfo = await this.getHostInfo(ip, port);
            if (!hostInfo) {
                return 'notVrchat';
            }
            if (!this.isVrchatHostInfo(hostInfo)) {
                this.logger.log(`Skipping (${hostInfo.NAME} is not VRChat)`);
                return 'notVrchat';
            }
            this.logger.log(`Successfully found VRChat OscQuery`);
            this.oscAddress = hostInfo.OSC_IP;
            this.oscPort = hostInfo.OSC_PORT;
            this.oscqAddress = ip;
            this.oscqPort = port;
            this.status = 'success';
            return 'success';
        } catch(e) {
            this.logger.log("Port invalid", (e instanceof Error) ? e.stack : e);
        }
        return 'httpError';
    }

    private isVrchatHostInfo(hostInfo: HostInfo) {
        return hostInfo.NAME.startsWith("VRChat-Client-");
    }

    async getOscqueryPortFromLogs(): Promise<{port?: number, logsFound: boolean}> {
        const latestLogPath = await this.logFinder.getLatestLog();
        if (!latestLogPath) return {logsFound: false};

        let port: number | undefined;
        const input = fsPlain.createReadStream(latestLogPath);
        try {
            const lineReader = readline.createInterface({input});
            for await (const line of lineReader) {
            const m = line.match("of type OSCQuery on (\\d+)");
            if (m) {
                port = parseInt(m[1]!);
            }
            }
        } finally {
            input.close();
        }

        return {port, logsFound: true};
    }

    async getBulk() {
        if (!this.oscqAddress || !this.oscqPort) return null;
        const json = await got({
            url: `http://${this.oscqAddress}:${this.oscqPort}/`,
            timeout: { request: 5000 }
        }).json();
        const values: Record<string,unknown> = {};
        this.collectValues(json, values);
        return values;
    }
    collectValues(input: unknown, output: Record<string,unknown>) {
        if (typia.is<OscQueryValueNode>(input) && input.VALUE.length > 0) {
            output[input.FULL_PATH] = input.VALUE[0];
        }
        if (Array.isArray(input)) {
            for (const child of input) {
                this.collectValues(child, output);
            }
            return;
        }
        if (typia.is<Record<string, unknown>>(input)) {
            for (const child of Object.values(input)) {
                this.collectValues(child, output);
            }
        }
    }

    getOscqueryAddress(): [string,number] | null {
        if (!this.oscqAddress || !this.oscqPort) return null;
        return [this.oscqAddress, this.oscqPort];
    }

    getOscAddress(): [string,number] | null {
        if (!this.oscAddress || !this.oscPort) return null;
        return [this.oscAddress, this.oscPort];
    }

    getStatus(): OscqueryStatus {
        return this.status;
    }

    getLogsFound(): boolean {
        return this.logsFound;
    }
}
