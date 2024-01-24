import {DiscoveredService, OSCQueryDiscovery} from "oscquery";
import MyAddressesService from "./MyAddressesService";
import LoggerService from "./LoggerService";
import Path from "path";
import {app} from "electron";
import fs from "fs/promises";
import fsPlain from "fs";
import * as readline from "node:readline/promises";
import path from "path";
import Bonjour from "bonjour-service";
import {Service} from "typedi";
import type {Service as BounjourService} from "bonjour-service";
import got from "got";
import { z } from 'zod';
import VrchatLogFinder from "./VrchatLogFinder";

const HostInfo = z.object({
    NAME: z.string().optional(),
    OSC_IP: z.string().optional(),
    OSC_PORT: z.number().optional(),
});

/** Finds and keeps track of the local VRChat OSCQ service address */
@Service()
export default class VrchatOscqueryService {
    private readonly logger;

    private oscqAddress?: string;
    private oscqPort?: number;
    private oscAddress?: string;
    private oscPort?: number;
    private mdnsBrowser;

    constructor(
        private myAddress: MyAddressesService,
        private logFinder: VrchatLogFinder,
        logger: LoggerService
    ) {
        this.logger = logger.get("vrcOscQuery");

        const mdns = new Bonjour();
        this.mdnsBrowser = mdns.find({
            type: "oscjson",
            protocol: "tcp"
        });

        (async () => {
            while(true) {
                await this.rescan();
                await new Promise(r => setTimeout(r, 5000));
            }
        })();
    }

    async rescan() {
        if (this.oscqAddress && this.oscqPort) {
            let stillGood = false;
            try {
                const hostInfo = await this.getHostInfo(this.oscqAddress, this.oscqPort);
                stillGood = true;
            } catch(e) {}
            if (stillGood) return;
        }

        this.logger.log("Scanning for VRC OscQuery ...");
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
                if (await this.checkPort('127.0.0.1', port)) return;
            }
            if (await this.checkPort(ip, port)) return;
        }

        this.logger.log("Checking vrchat logs for oscquery port ...");
        const portFromLogs = await this.getOscqueryPortFromLogs();
        if (portFromLogs) {
            this.logger.log(`Found port ${portFromLogs} in logs`);
            await this.checkPort('127.0.0.1', portFromLogs);
        } else {
            this.logger.log('Could not find port in logs');
        }
    }

    async getHostInfo(ip: string, port: number) {
        const json = await got({
            url: `http://${ip}:${port}/?HOST_INFO`,
            timeout: { request: 5000 }
        }).json();
        return HostInfo.parse(json);
    }
    async checkPort(ip: string, port: number) {
        try {
            const hostInfo = await this.getHostInfo(ip, port);
            if (!hostInfo.NAME || !hostInfo.NAME.startsWith("VRChat-Client-") || !hostInfo.OSC_IP || !hostInfo.OSC_PORT) {
                this.logger.log(`Skipping (${hostInfo.NAME} is not VRChat)`);
                return false;
            }
            this.logger.log(`Successfully found VRChat OscQuery`);
            this.oscAddress = hostInfo.OSC_IP;
            this.oscPort = hostInfo.OSC_PORT;
            this.oscqAddress = ip;
            this.oscqPort = port;
            return true;
        } catch(e) {
            this.logger.log("Port invalid", (e instanceof Error) ? e.stack : e);
        }
        return false;
    }

    async getOscqueryPortFromLogs() {
        let port;
        await this.logFinder.forEachLine(line => {
            const m = line.match("of type OSCQuery on (\\d+)");
            if (m) {
                port = parseInt(m[1]!);
            }
        });
        return port;
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
        if (Array.isArray(input)) {
            for (const child of input) {
                this.collectValues(child, output);
            }
        } else if (input instanceof Object) {
            if ('FULL_PATH' in input
                && typeof(input.FULL_PATH) == 'string'
                && 'VALUE' in input
                && Array.isArray(input.VALUE)
                && input.VALUE.length > 0
            ) {
                output[input.FULL_PATH] = input.VALUE[0];
            }
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
}
