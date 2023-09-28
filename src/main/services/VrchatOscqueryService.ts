import {DiscoveredService, OSCQueryDiscovery} from "oscquery";
import MyAddressesService from "./MyAddressesService";
import {Service} from "typedi";
import LoggerService from "./LoggerService";

/** Finds and keeps track of the local VRChat OSCQ service address */
@Service()
export default class VrchatOscqueryService {
    private service?: DiscoveredService;
    private readonly logger;

    constructor(
        myAddress: MyAddressesService,
        logger: LoggerService
    ) {
        this.logger = logger.get("vrcOscQuery");

        const discovery = new OSCQueryDiscovery();
        discovery.start();

        discovery.on('up', (service: DiscoveredService) => {
            if (!service.hostInfo.name?.startsWith("VRChat-Client")) return;
            if (!myAddress.has(service.address)) {
                this.logger.log(`Received OSCQuery broadcast from unknown address: ${service.address}`);
                return;
            }
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
