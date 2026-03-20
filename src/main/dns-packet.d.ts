declare module "dns-packet" {
    export interface QuestionRecord {
        name: string;
        type: string;
        class?: string;
    }

    export interface AnswerRecord {
        name: string;
        type: "PTR" | "SRV" | "TXT" | "A";
        class?: "IN";
        ttl?: number;
        flush?: boolean;
        data:
            | string
            | Buffer
            | Array<string | Buffer>
            | {
                priority: number;
                weight: number;
                port: number;
                target: string;
            };
    }

    export interface Packet {
        type: "query" | "response";
        id?: number;
        flags?: number;
        questions?: QuestionRecord[];
        answers?: AnswerRecord[];
        additionals?: AnswerRecord[];
        authorities?: AnswerRecord[];
    }

    export const AUTHORITATIVE_ANSWER: number;

    const dnsPacket: {
        AUTHORITATIVE_ANSWER: number;
        encode(packet: Packet): Buffer;
        decode(buffer: Buffer): Packet;
    };

    export default dnsPacket;
}
