import Bonjour from "bonjour-service";
import {Service} from "typedi";

export interface MdnsServiceQuery {
    type: string;
    protocol: "tcp" | "udp";
}

/** Keeps mDNS browsers alive so services can share their discovered-service registry. */
@Service()
export default class MdnsRegistryService {
    private readonly mdns = new Bonjour();
    private readonly browsers = new Map<string, InstanceType<typeof Bonjour.Browser>>();

    getServices(query: MdnsServiceQuery) {
        const key = `${query.type}.${query.protocol}`;
        let browser = this.browsers.get(key);
        if (!browser) {
            browser = this.mdns.find(query);
            this.browsers.set(key, browser);
        }
        browser.update();
        return browser.services;
    }
}
