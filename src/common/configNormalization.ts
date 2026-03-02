import {produce, type Draft} from "immer";
import type {Config} from "./configTypes";

export function normalizeAddress(
    input: string | undefined,
    defaultPort = 12345,
    stripScheme = false,
): string | undefined {
    const value = (input ?? '').trim();
    if (!value) return undefined;

    let candidate = /^\d+$/.test(value) ? `localhost:${value}` : value;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
        candidate = `ws://${candidate}`;
    }

    try {
        const parsed = new URL(candidate);
        const protocol = parsed.protocol.toLowerCase();
        parsed.protocol = (protocol === 'ws:' || protocol === 'wss:') ? protocol : 'ws:';
        const hostname = parsed.hostname;
        if (!hostname) return undefined;
        const resolvedPort = parsed.port || (defaultPort > 0 ? `${defaultPort}` : '');
        if (!resolvedPort) return undefined;
        const isLoopbackV4 = hostname === '127.0.0.1';
        const normalizedHost = isLoopbackV4 ? 'localhost' : hostname;
        if (stripScheme) return `${normalizedHost}:${resolvedPort}`;
        return `${parsed.protocol}//${normalizedHost}:${resolvedPort}`;
    } catch {
        return undefined;
    }
}

export function normalizeConfigDraft(draft: Draft<Config>): void {
    const normalizedIntifaceAddress = normalizeAddress(draft.intifaceAddress);
    const shouldUnsetIntifaceAddress =
        normalizedIntifaceAddress === undefined
        || normalizedIntifaceAddress === 'ws://localhost:12345';
    if (shouldUnsetIntifaceAddress) delete draft.intifaceAddress;
    else draft.intifaceAddress = normalizedIntifaceAddress;

    draft.oscProxy = draft.oscProxy.map(target => {
        const normalized = normalizeAddress(target, undefined, true) ?? '';
        if (normalized === 'localhost:9000' || normalized === 'localhost:9001') return '';
        return normalized;
    });

    for (const output of draft.outputs) {
        if (!output.linear) continue;
        const linearEntries = Object.entries(output.linear).filter(([, value]) => value !== undefined);
        if (linearEntries.length === 0) {
            delete output.linear;
        }
    }
}

export function normalizeConfig(config: Config): Config {
    return produce(config, (draft) => normalizeConfigDraft(draft));
}

