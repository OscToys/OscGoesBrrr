import http from "node:http";
import {Service} from "typedi";
import LoggerService from "./LoggerService";
import OscQueryPortService from "./OscQueryPortService";

@Service()
export default class OscQueryHttpServerService {
    private readonly logger;
    private port?: number;

    constructor(
        private oscQueryPortService: OscQueryPortService,
        logger: LoggerService,
    ) {
        this.logger = logger.get("OscQueryHttpServerService");
        void this.start();
    }

    private async start() {
        const port = this.port = await this.oscQueryPortService.get();

        const httpServer = http.createServer(this.handleRequest.bind(this));

        httpServer.on("error", e => this.logger.log(`HTTP server error ${e.stack}`));

        try {
            await new Promise<void>((resolve, reject) => {
                httpServer.listen(port, "127.0.0.1", () => {
                    resolve();
                }).on("error", err => {
                    reject(err);
                });
            });
        } catch (error) {
            throw error;
        }

        this.logger.log(`OSCQuery HTTP started on 127.0.0.1:${port}`);
        const stop = () => {
            if (httpServer.listening) {
                httpServer.close();
            }
        };
        process.once("exit", stop);
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        const remoteAddress = req.socket.remoteAddress;
        this.logger.log(
            `OSCQuery HTTP ${req.method ?? "UNKNOWN"} ${req.url ?? "/"} from ${remoteAddress ?? "unknown"}`
        );

        if (req.method !== "GET") {
            res.statusCode = 405;
            res.end();
            return;
        }

        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname !== "/") {
            res.statusCode = 404;
            res.end();
            return;
        }

        if (url.search === "?HOST_INFO") {
            const port = this.port;
            if (port === undefined) {
                res.statusCode = 500;
                res.end();
                return;
            }
            this.respondJson(res, {
                EXTENSIONS: {
                    ACCESS: true,
                    VALUE: true,
                    RANGE: true,
                    DESCRIPTION: true,
                    TAGS: true,
                    CRITICAL: true,
                    CLIPMODE: true,
                },
                OSC_IP: "127.0.0.1",
                OSC_PORT: port,
                OSC_TRANSPORT: "UDP",
            });
            return;
        }

        if (url.search.length > 0) {
            res.statusCode = 400;
            res.end();
            return;
        }

        this.respondJson(res, {
            FULL_PATH: "/",
            DESCRIPTION: "root node",
            ACCESS: 0,
            CONTENTS: {
                avatar: {
                    FULL_PATH: "/avatar",
                    ACCESS: 0,
                    CONTENTS: {
                        change: {
                            FULL_PATH: "/avatar/change",
                            ACCESS: 2,
                        },
                    },
                },
            },
        });
    }

    private respondJson(res: http.ServerResponse, body: unknown) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(body));
    }
}
