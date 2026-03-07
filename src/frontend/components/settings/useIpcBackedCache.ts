import {useCallback, useEffect, useRef, useState} from "react";
import {replaceEqualDeep} from "@tanstack/query-core";
import {invokeIpc, onIpc} from "../../ipc";
import {Result} from "../../../common/result";
import {atom, type PrimitiveAtom, useStore} from "jotai";

type ChangeEventChannel = 'config:changed' | 'settings-state:changed';
type RequestInvokeChannel = 'config:request' | 'settings-state:request';
type SaveInvokeChannel = 'config:set';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Params<T> {
    changeEvent: ChangeEventChannel;
    requestInvoke: RequestInvokeChannel;
    parseResult: (raw: unknown) => Result<T>;
    saveInvoke?: SaveInvokeChannel;
    pollMs?: number;
}

interface IpcBackedCacheResult<T> {
    dataAtom: PrimitiveAtom<T | undefined>;
    loadError: string | undefined;
    saveError: string | undefined;
    saveState: SaveState;
}

/**
 * Bridges IPC-backed backend state into a local Jotai atom with safe save semantics.
 *
 * Why this hook exists:
 * - Components should consume a single atom shape (`T | undefined`) without knowing IPC details.
 * - UI edits should feel immediate and not be overwritten by transient remote timing during saves.
 * - Backend writes must be serialized so concurrent local edits do not create overlapping save calls.
 *
 * Main flow blocks:
 * 1) Remote ingest: listen to `<changeEvent>`, parse payloads, and apply them into the atom.
 * 2) Structural sharing: use `replaceEqualDeep` to preserve unchanged references and reduce rerenders.
 * 3) Save queue: coalesce local edits while one save is in flight, then flush latest queued value.
 * 4) Remote buffering while saving: hold incoming remote data until save finishes, then reconcile once.
 * 5) Echo guard: skip save-triggering for atom writes that originated from remote application.
 */
export default function useIpcBackedCache<T>({
    changeEvent,
    requestInvoke,
    parseResult,
    saveInvoke,
    pollMs,
}: Params<T>): IpcBackedCacheResult<T> {
    const store = useStore();
    const [loadError, setLoadError] = useState<string | undefined>(undefined);
    const [saveError, setSaveError] = useState<string | undefined>(undefined);
    const [saveState, setSaveState] = useState<SaveState>('idle');
    const savedTimerRef = useRef<number | undefined>(undefined);
    const dataAtomRef = useRef<PrimitiveAtom<T | undefined>>(atom<T | undefined>(undefined));
    const isApplyingRemoteRef = useRef(false);
    const isSavingRef = useRef(false);
    const queuedLocalRef = useRef<T | undefined>(undefined);
    const pendingRemoteRef = useRef<T | undefined>(undefined);
    const dataAtom = dataAtomRef.current;

    // Save-status helper: ensures only one "Saved" visibility timer exists at a time.
    const clearSavedTimer = useCallback(() => {
        if (savedTimerRef.current !== undefined) {
            window.clearTimeout(savedTimerRef.current);
            savedTimerRef.current = undefined;
        }
    }, []);

    // Remote -> atom application path with structural sharing and save-echo suppression.
    const applyRemoteData = useCallback((next: T | undefined) => {
        if (next === undefined) return;
        const current = store.get(dataAtom);
        const merged = replaceEqualDeep(current, next);
        if (merged === current) return;
        isApplyingRemoteRef.current = true;
        store.set(dataAtom, merged);
        isApplyingRemoteRef.current = false;
    }, [dataAtom, store]);

    // Active request path used by initial load and optional polling.
    const requestData = useCallback(async () => {
        try {
            await invokeIpc(requestInvoke);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : String(e));
        }
    }, [requestInvoke]);

    // Remote ingest subscription:
    // - parse incoming payloads
    // - buffer while saving to avoid stale-overwrite during in-flight local commit
    // - otherwise apply immediately to atom
    useEffect(() => {
        const off = onIpc(changeEvent, (rawResult) => {
            try {
                const result = parseResult(rawResult);
                if (!result.ok) return setLoadError(String(result.error));
                setLoadError(undefined);
                if (isSavingRef.current) {
                    pendingRemoteRef.current = result.data;
                    return;
                }
                applyRemoteData(result.data);
            } catch {
                // Ignore malformed payloads.
            }
        });
        void requestData();
        if (!pollMs) {
            return () => {
                off();
            };
        }
        const pollTimer = window.setInterval(() => {
            void requestData();
        }, pollMs);
        return () => {
            window.clearInterval(pollTimer);
            off();
        };
    }, [applyRemoteData, changeEvent, parseResult, pollMs, requestData]);

    // Cleanup saved-indicator timer on unmount.
    useEffect(() => {
        return () => {
            clearSavedTimer();
        };
    }, [clearSavedTimer]);

    // Visual save completion indicator state machine helper.
    const showSaved = useCallback(() => {
        clearSavedTimer();
        setSaveState('saved');
        savedTimerRef.current = window.setTimeout(() => {
            setSaveState('idle');
            savedTimerRef.current = undefined;
        }, 1300);
    }, [clearSavedTimer]);

    // Local edit -> serialized backend persistence:
    // - coalesce local edits while saving
    // - flush latest queued value(s) sequentially
    // - after each save, reconcile at most one buffered remote payload
    const persistData = useCallback(async (nextData: T) => {
        if (!saveInvoke) return;
        queuedLocalRef.current = nextData;
        if (isSavingRef.current) return;
        while (queuedLocalRef.current !== undefined) {
            const currentSave = queuedLocalRef.current;
            queuedLocalRef.current = undefined;
            isSavingRef.current = true;
            clearSavedTimer();
            setSaveError(undefined);
            setSaveState('saving');
            try {
                await invokeIpc(saveInvoke, currentSave as never);
                showSaved();
            } catch (e) {
                setSaveError(e instanceof Error ? e.message : String(e));
                setSaveState('error');
            } finally {
                isSavingRef.current = false;
                if (pendingRemoteRef.current !== undefined) {
                    const nextRemote = pendingRemoteRef.current;
                    pendingRemoteRef.current = undefined;
                    applyRemoteData(nextRemote);
                }
            }
        }
    }, [applyRemoteData, clearSavedTimer, saveInvoke, showSaved]);

    // Subscribe to atom writes for persistence (save-enabled mode only).
    // Writes originating from `applyRemoteData` are ignored by the echo guard.
    useEffect(() => {
        if (!saveInvoke) return;
        return store.sub(dataAtom, () => {
            const nextData = store.get(dataAtom);
            if (nextData === undefined) return;
            if (isApplyingRemoteRef.current) return;
            void persistData(nextData);
        });
    }, [dataAtom, persistData, saveInvoke, store]);

    return {
        dataAtom,
        loadError,
        saveError,
        saveState,
    };
}
