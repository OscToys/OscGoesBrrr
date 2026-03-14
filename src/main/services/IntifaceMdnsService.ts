import Bonjour from "bonjour-service";
import type {Service as BonjourService} from "bonjour-service";
import {Service} from "typedi";
import LoggerService from "./LoggerService";

@Service()
export default class IntifaceMdnsService {
    private readonly logger;
    private readonly browser;
    private readonly updateTimer;

    constructor(loggerService: LoggerService) {
        this.logger = loggerService.get("intifaceMdns");
        const mdns = new Bonjour();
        this.browser = mdns.find({
            type: "intiface_engine",
            protocol: "tcp",
        });
        this.browser.on("up", (service: BonjourService) => {
            this.logger.log(`Discovered Intiface mDNS service ${service.name}`);
        });
        this.updateTimer = setInterval(() => {
            this.browser.update();
        }, 5000);
    }

    getAddresses(): string[] {
        const results: string[] = [];
        for (const service of this.browser.services as BonjourService[]) {
            const host = service.referer?.address;
            if (!host) continue;
            const formattedHost = host.includes(":") ? `[${host}]` : host;
            results.push(`ws://${formattedHost}:12345/`);
        }
        return Array.from(new Set(results));
    }
}
