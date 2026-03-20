import http from "node:http";
import {OSCQueryServer, OSCQAccess} from "oscquery";
import {Service} from "typedi";
import LoggerService from "./LoggerService";
import OscQueryPortService from "./OscQueryPortService";

@Service()
export default class OscQueryHttpServerService {
    private readonly logger;
    private started = false;

    constructor(
        private oscQueryPortService: OscQueryPortService,
        logger: LoggerService,
    ) {
        this.logger = logger.get("oscLog");
        void this.start();
    }

    async start() {
        if (this.started) return;
        this.started = true;
        const port = await this.oscQueryPortService.get();
        const oscQuery = new OSCQueryServer({
            httpPort: port,
            serviceName: "OGB",
            oscIp: "127.0.0.1",
        });
        oscQuery.addMethod("/avatar/change", {access: OSCQAccess.WRITEONLY});

        const httpServer = http.createServer((req, res) => {
            const remoteAddress = req.socket.remoteAddress;
            this.logger.log(
                `OSCQuery HTTP ${req.method ?? "UNKNOWN"} ${req.url ?? "/"} from ${remoteAddress ?? "unknown"}`
            );
            oscQuery._httpHandler(req, res);
        });

        httpServer.on("error", e => this.logger.log(`HTTP server error ${e.stack}`));

        await new Promise<void>((resolve, reject) => {
            httpServer.listen(port, "127.0.0.1", () => {
                resolve();
            }).on("error", err => {
                reject(err);
            });
        });

        this.logger.log(`OSCQuery HTTP started on 127.0.0.1:${port}`);
        const stop = () => {
            httpServer.close();
            oscQuery.stop();
        };
        process.once("exit", stop);
    }
}
