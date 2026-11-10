import portfinder from "portfinder";
import {Service} from "typedi";
import LoggerService from "../../../main/services/LoggerService";

@Service()
export default class OscQueryPortService {
    private readonly logger;
    private portPromise?: Promise<number>;

    constructor(logger: LoggerService) {
        this.logger = logger.get("OscQueryPortService");
    }

    async get() {
        return await (this.portPromise ??= this.selectPort());
    }

    private async selectPort() {
        const port = await portfinder.getPortPromise({
            port: 33776,
        });
        this.logger.log(`Selected OSCQuery port: ${port}`);
        return port;
    }
}
