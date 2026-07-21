import Bonjour from "bonjour-service";
import type {ServiceConfig} from "bonjour-service";
import {Service} from "typedi";
import MyAddressesService from "./MyAddressesService";

export interface MdnsServiceQuery {
    type: string;
    protocol: "tcp" | "udp";
}

type BonjourNetworkOptions = Partial<ServiceConfig> & {interface: string};

/** Keeps mDNS browsers alive so services can share their discovered-service registry. */
@Service()
export default class MdnsRegistryService {
    // multicast-dns otherwise sends through one default interface, which can be a VPN or virtual adapter on Windows.
    private readonly mdnsClients: Bonjour[];
    private readonly browsers = new Map<string, InstanceType<typeof Bonjour.Browser>[]>();

    constructor(myAddresses: MyAddressesService) {
        const addresses = myAddresses.getExternalIpv4Addresses();
        this.mdnsClients = addresses.length === 0 ? [new Bonjour()] : addresses.map(address => {
            const options: BonjourNetworkOptions = {interface: address};
            return new Bonjour(options);
        });
    }

    getServices(query: MdnsServiceQuery) {
        const key = `${query.type}.${query.protocol}`;
        let browser = this.browsers.get(key);
        if (!browser) {
            browser = this.mdnsClients.map(mdns => mdns.find(query));
            this.browsers.set(key, browser);
        }
        browser.forEach(currentBrowser => currentBrowser.update());
        return [...new Map(browser.flatMap(currentBrowser => currentBrowser.services).map(service => [service.fqdn, service])).values()];
    }
}
