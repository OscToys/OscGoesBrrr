export function normalizeAddress(
    input: string | undefined,
    defaultPort: number,
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
