import type {Draft} from "immer";
import type {Config} from "../../common/configTypes";
import type {NormalizeSource} from "./AbstractJsonStateService";

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
        if (hostname.includes('=')) return undefined;
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

export function normalizeConfigDraft(draft: Draft<Config>, source: NormalizeSource): void {
    const normalizedIntifaceAddress = normalizeAddress(draft.intifaceAddress);
    if (normalizedIntifaceAddress === undefined) delete draft.intifaceAddress;
    else draft.intifaceAddress = normalizedIntifaceAddress;

    draft.oscProxy = draft.oscProxy.map(target => {
        const normalized = normalizeAddress(target, 0, true) ?? '';
        if (normalized === 'localhost:9000' || normalized === 'localhost:9001') return '';
        return normalized;
    });
    if (source === 'load') {
        draft.oscProxy = draft.oscProxy.filter(target => target !== '');
    }

    for (const output of draft.outputs) {
        if (!output.linear) continue;
        const linearEntries = Object.entries(output.linear).filter(([, value]) => value !== undefined);
        if (linearEntries.length === 0) {
            delete output.linear;
        }
    }
}
