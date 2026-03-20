import dgram from "dgram";
import dnsPacket from "dns-packet";
import {Service} from "typedi";
import LoggerService from "./LoggerService";
import MyAddressesService from "./MyAddressesService";
import ConfigService from "./ConfigService";
import OscQueryPortService from "./OscQueryPortService";

@Service()
export default class OscQueryMdnsBroadcastService {
    private static readonly MULTICAST_ADDRESS = "224.0.0.251";
    private static readonly MULTICAST_PORT = 5353;
    private static readonly REBROADCAST_MS = 5_000;

    private readonly logger;

    constructor(
        private myAddresses: MyAddressesService,
        private configService: ConfigService,
        private oscQueryPortService: OscQueryPortService,
        logger: LoggerService,
    ) {
        this.logger = logger.get("oscLog");
        void this.run();
    }

    private async run() {
        while (true) {
            try {
                await this.broadcastOnce();
            } catch (error) {
                this.logger.log(
                    `OSCQuery MDNS broadcast iteration failed: ${error instanceof Error ? error.stack : error}`
                );
            }
            await new Promise(resolve => setTimeout(resolve, OscQueryMdnsBroadcastService.REBROADCAST_MS));
        }
    }

    private async broadcastOnce() {
        const useOscQuery = this.configService.getCached().useOscQuery;
        if (!useOscQuery) {
            return;
        }

        const port = await this.oscQueryPortService.get();
        const packet = buildOscQueryMdnsPacket("OGB", port);
        const addresses = this.myAddresses.getExternalIpv4Addresses();
        if (addresses.length === 0) {
            this.logger.log("OSCQuery MDNS broadcaster could not start because no external IPv4 interfaces are available");
            return;
        }

        await Promise.all(addresses.map(async (address) => {
            const socket = dgram.createSocket({type: "udp4", reuseAddr: true});
            try {
                socket.on("error", error => {
                    this.logger.log(
                        `MDNS broadcaster error on ${address}: ${error instanceof Error ? error.stack : error}`
                    );
                });
                await this.startSocket(socket, address);
                await this.broadcastOnSocket(socket, packet);
            } finally {
                socket.close();
            }
        }));
    }

    private async startSocket(socket: dgram.Socket, address: string) {
        await new Promise<void>((resolve, reject) => {
            socket.once("error", reject);
            socket.bind(OscQueryMdnsBroadcastService.MULTICAST_PORT, address, () => {
                socket.off("error", reject);
                resolve();
            });
        });
        socket.setMulticastLoopback(true);
        socket.setMulticastTTL(255);
        socket.setMulticastInterface(address);
    }

    private async broadcastOnSocket(socket: dgram.Socket, packet: Buffer) {
        try {
            await new Promise<void>((resolve, reject) => {
                socket.send(
                    packet,
                    OscQueryMdnsBroadcastService.MULTICAST_PORT,
                    OscQueryMdnsBroadcastService.MULTICAST_ADDRESS,
                    error => {
                        if (error) {
                            reject(error);
                            return;
                        }
                        resolve();
                    }
                );
            });
        } catch (error) {
            this.logger.log(
                `MDNS multicast broadcast failed: ${error instanceof Error ? error.stack : error}`
            );
        }
    }
}

function buildOscQueryMdnsPacket(serviceName: string, port: number) {
    const serviceType = "_oscjson._tcp.local";
    const instanceName = `${serviceName}.${serviceType}`;
    const targetName = `${serviceName}.oscjson.tcp`;

    return dnsPacket.encode({
        type: "response",
        flags: dnsPacket.AUTHORITATIVE_ANSWER,
        questions: [],
        answers: [
            {
                name: serviceType,
                type: "PTR",
                class: "IN",
                ttl: 120,
                data: instanceName,
            },
        ],
        additionals: [
            {
                name: instanceName,
                type: "SRV",
                class: "IN",
                ttl: 120,
                flush: true,
                data: {
                    priority: 0,
                    weight: 0,
                    port,
                    target: targetName,
                },
            },
            {
                name: instanceName,
                type: "TXT",
                class: "IN",
                ttl: 120,
                flush: true,
                data: ["txtvers=1"],
            },
            {
                name: targetName,
                type: "A",
                class: "IN",
                ttl: 120,
                flush: true,
                data: "127.0.0.1",
            },
        ],
        authorities: [],
    });
}
