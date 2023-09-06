import {DiscoveredService, OSCQueryDiscovery} from "oscquery";
import MyAddressesService from "./MyAddressesService";
import {Service} from "typedi";

/** Finds and keeps track of the local VRChat OSCQ service address */
@Service()
export default class VrchatOscqueryService {
    service?: DiscoveredService;

    constructor(myAddress: MyAddressesService) {
        const discovery = new OSCQueryDiscovery();
        discovery.start();

        discovery.on('up', (service: DiscoveredService) => {
            if (!service.hostInfo.name?.startsWith("VRChat-Client")) return;
            if (!myAddress.has(service.address)) return;
            this.service = service;
        });
    }

    async getBulk() {
        if (!this.service) return null;
        await this.service.update();
        return this.service.flat();
    }

    getOscqueryAddress(): [string,number] | null {
        if (!this.service) return null;
        return [this.service.address, this.service.port];
    }

    getOscAddress(): [string,number] | null {
        if (!this.service || !this.service.hostInfo.oscIp || !this.service.hostInfo.oscPort) return null;
        return [this.service.hostInfo.oscIp, this.service.hostInfo.oscPort];
    }
}
