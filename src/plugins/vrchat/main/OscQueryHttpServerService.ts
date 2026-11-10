import http from "node:http";
import {Service} from "typedi";
import LoggerService from "../../../main/services/LoggerService";
import OscQueryPortService from "./OscQueryPortService";
import type {PluginContext} from '../../../main/plugins/PluginContext';

@Service()
export default class OscQueryHttpServerService {
    private readonly logger;
    private port?: number;

    constructor(
        private oscQueryPortService: OscQueryPortService,
        logger: LoggerService,
    ) {
        this.logger = logger.get("OscQueryHttpServerService");
    }

    async start(context: PluginContext) {
        const port = this.port = await this.oscQueryPortService.get();
        if (context.signal.aborted) return;

        const httpServer = http.createServer(this.handleRequest.bind(this));
        context.onCleanup(() => {
            if (httpServer.listening) httpServer.close();
            httpServer.closeAllConnections();
        });

        httpServer.on("error", e => this.logger.log(`HTTP server error ${e.stack}`));

        const listening = Promise.withResolvers<void>();
        // Closing before `listening` suppresses that event, so cancellation must settle the wait too.
        const onAbort = () => listening.resolve();
        context.signal.addEventListener('abort', onAbort, {once: true});
        httpServer.once('error', listening.reject);
        try {
            httpServer.listen({port, host: '127.0.0.1', signal: context.signal}, listening.resolve);
            await listening.promise;
        } finally {
            context.signal.removeEventListener('abort', onAbort);
            httpServer.off('error', listening.reject);
        }
        if (context.signal.aborted) return;

        this.logger.log(`OSCQuery HTTP started on 127.0.0.1:${port}`);
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
