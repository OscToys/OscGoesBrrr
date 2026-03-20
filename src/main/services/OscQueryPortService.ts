import portfinder from "portfinder";
import {Service} from "typedi";
import LoggerService from "./LoggerService";

@Service()
export default class OscQueryPortService {
    private readonly logger;
    private readonly portPromise: Promise<number>;

    constructor(logger: LoggerService) {
        this.logger = logger.get("OscQueryPortService");
        this.portPromise = this.selectPort();
    }

    async get() {
        return await this.portPromise;
    }

    private async selectPort() {
        const port = await portfinder.getPortPromise({
            port: 33776,
        });
        this.logger.log(`Selected OSCQuery port: ${port}`);
        return port;
    }
}
