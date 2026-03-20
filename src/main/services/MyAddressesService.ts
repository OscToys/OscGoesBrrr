import os from "os";
import {Service} from "typedi";

/** Keeps track of what local IP addresses belong to this machine */
@Service()
export default class MyAddressesService {
    private myAddresses = new Set<string>();
    private ipv4Interfaces: {address: string; netmask: string}[] = [];

    constructor() {
        this.update();
        setInterval(() => this.update(), 5000);
    }

    private update() {
        const interfaces = Object.values(os.networkInterfaces()).flatMap(infs => infs ?? []);
        this.myAddresses = new Set(
            interfaces
                .map(inf => inf?.address)
                .filter(address => address != undefined)
                .map(address => address!)
        );
        this.ipv4Interfaces = interfaces
            .filter((inf): inf is NonNullable<typeof inf> => inf !== undefined)
            .filter(inf => inf.family === "IPv4" && !inf.internal)
            .map(inf => ({
                address: inf.address,
                netmask: inf.netmask,
            }));
    }

    has(ip: string) {
        const normalized = normalizeIpAddress(ip);
        if (!normalized) return false;
        return this.myAddresses.has(normalized);
    }

    getExternalIpv4Addresses() {
        return this.ipv4Interfaces.map(entry => entry.address);
    }

    sharesSubnet(ip: string) {
        const normalized = normalizeIpAddress(ip);
        if (!normalized) return false;
        const targetInt = ipv4ToInt(normalized);
        if (targetInt === undefined) return false;
        for (const entry of this.ipv4Interfaces) {
            const addressInt = ipv4ToInt(entry.address);
            const netmaskInt = ipv4ToInt(entry.netmask);
            if (addressInt === undefined || netmaskInt === undefined) continue;
            if ((targetInt & netmaskInt) === (addressInt & netmaskInt)) {
                return true;
            }
        }
        return false;
    }
}

function normalizeIpAddress(address: string | undefined): string | undefined {
    if (!address) return undefined;
    if (address.startsWith("::ffff:")) {
        return address.substring("::ffff:".length);
    }
    return address;
}

function ipv4ToInt(address: string): number | undefined {
    const parts = address.split(".");
    if (parts.length !== 4) return undefined;
    let result = 0;
    for (const part of parts) {
        const value = Number(part);
        if (!Number.isInteger(value) || value < 0 || value > 255) return undefined;
        result = (result << 8) | value;
    }
    return result >>> 0;
}
