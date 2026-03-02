import {produce} from 'immer';
import get from 'lodash/get';
import set from 'lodash/set';
import unset from 'lodash/unset';
import type {Get, Paths} from 'type-fest';

export type DotPath<T> = Extract<Paths<T>, string>;
export type PathValue<T, P extends DotPath<T>> = Get<T, P>;

export function getTypedPathValue<T, P extends DotPath<T>>(source: T, path: P): PathValue<T, P> | undefined {
    return get(source, path) as PathValue<T, P> | undefined;
}

export function setTypedPathValue<T extends object, P extends DotPath<T>>(source: T, path: P, value: PathValue<T, P> | undefined): T {
    return produce(source, (draft) => {
        if (value === undefined) unset(draft, path);
        else set(draft, path, value);
    });
}
