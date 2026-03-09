function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object'
        && value !== null
        && Object.getPrototypeOf(value) === Object.prototype;
}

export function replaceEqualDeep<T>(prev: T, next: T): T {
    if (Object.is(prev, next)) return prev;

    if (Array.isArray(prev) && Array.isArray(next)) {
        if (prev.length !== next.length) {
            return next.map((value, index) => replaceEqualDeep(prev[index], value)) as T;
        }
        let changed = false;
        const result = next.map((value, index) => {
            const merged = replaceEqualDeep(prev[index], value);
            if (!Object.is(merged, prev[index])) changed = true;
            return merged;
        });
        return changed ? result as T : prev;
    }

    if (isPlainObject(prev) && isPlainObject(next)) {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(next);
        if (prevKeys.length !== nextKeys.length) {
            const result: Record<string, unknown> = {};
            for (const key of nextKeys) {
                result[key] = replaceEqualDeep(prev[key], next[key]);
            }
            return result as T;
        }
        let changed = false;
        const result: Record<string, unknown> = {};
        for (const key of nextKeys) {
            const merged = replaceEqualDeep(prev[key], next[key]);
            result[key] = merged;
            if (!Object.is(merged, prev[key])) changed = true;
        }
        return changed ? result as T : prev;
    }

    return next;
}
