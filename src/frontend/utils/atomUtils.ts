import {atom, type PrimitiveAtom} from "jotai";

/**
 * A minimal, type-safe "focus one object key" helper for Jotai.
 *
 * Why this exists:
 * - We only need single-key focusing (`prop`) in this codebase.
 * - It replaces `jotai-optics` for this narrow use case, so we avoid the extra
 *   optics dependency while keeping component-local writable child atoms.
 */
export function focusKeyAtom<T extends object, K extends keyof T>(
    baseAtom: PrimitiveAtom<T>,
    key: K,
) {
    return atom(
        (get) => get(baseAtom)[key],
        (get, set, nextValue: T[K] | ((prev: T[K]) => T[K])) => {
            const previousObject = get(baseAtom);
            const previousValue = previousObject[key];
            const nextResolvedValue =
                typeof nextValue === "function"
                    ? (nextValue as (prev: T[K]) => T[K])(previousValue)
                    : nextValue;
            if (Object.is(previousValue, nextResolvedValue)) return;
            set(baseAtom, {
                ...previousObject,
                [key]: nextResolvedValue,
            });
        },
    );
}

/**
 * Focuses a key on an optional parent object atom (`T | undefined`).
 *
 * Behavior note:
 * - Writing `undefined` removes that key from the parent object.
 * - If that removal makes the parent object empty, the parent is collapsed to
 *   `undefined` (missing) instead of keeping an empty object (`{}`).
 */
export function focusOptionalKeyAtom<T extends object, K extends keyof T>(
    baseAtom: PrimitiveAtom<T | undefined>,
    key: K,
) {
    return atom(
        (get) => get(baseAtom)?.[key],
        (get, set, nextValue: T[K] | undefined | ((prev: T[K] | undefined) => T[K] | undefined)) => {
            const previousObject = get(baseAtom);
            const previousValue = previousObject?.[key];
            const nextResolvedValue =
                typeof nextValue === "function"
                    ? (nextValue as (prev: T[K] | undefined) => T[K] | undefined)(previousValue)
                    : nextValue;
            if (Object.is(previousValue, nextResolvedValue)) return;
            if (previousObject === undefined) {
                if (nextResolvedValue === undefined) return;
                set(baseAtom, {[key]: nextResolvedValue} as T);
                return;
            }
            if (nextResolvedValue === undefined) {
                const nextObject = {...previousObject};
                delete nextObject[key];
                if (Object.keys(nextObject).length === 0) {
                    set(baseAtom, undefined);
                    return;
                }
                set(baseAtom, nextObject);
                return;
            }
            set(baseAtom, {
                ...previousObject,
                [key]: nextResolvedValue,
            });
        },
    );
}
