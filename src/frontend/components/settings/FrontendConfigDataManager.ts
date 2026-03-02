import {useEffect, useRef, useState} from "react";
import {Config} from "../../../common/configTypes";
import {normalizeConfig} from "../../../common/configNormalization";
import {invokeIpc, onIpc} from "../../ipc";
import typia from "typia";
import {Result} from "../../../common/result";

interface PendingSaveCall {
    task: () => Promise<void>;
    resolve: (value: boolean) => void;
    reject: (reason?: unknown) => void;
}

export interface FrontendConfigData {
    config: Config | undefined;
    loadError: string | undefined;
    saveError: string | undefined;
    saving: boolean;
    savedVisible: boolean;
    commitConfig: (nextConfig: Config) => void;
}

/**
 * Manages frontend config state end-to-end for Settings.
 *
 * Why this exists:
 * - Slider/rapid edits can trigger overlapping saves.
 * - `config:changed` echoes can arrive later and temporarily overwrite newer local edits.
 *
 * Guarantees:
 * - At most one `config:set` save runs at a time.
 * - While saving, only the latest pending save is kept (coalesced).
 * - Incoming remote config changes are buffered for a short window after local edits.
 * - When that window expires, the latest buffered remote config is applied once.
 */
export default function useFrontendConfigDataManager(): FrontendConfigData {
    const [config, setConfig] = useState<Config | undefined>(undefined);
    const [loadError, setLoadError] = useState<string | undefined>(undefined);
    const [saveError, setSaveError] = useState<string | undefined>(undefined);
    const [saving, setSaving] = useState(false);
    const [savedVisible, setSavedVisible] = useState(false);
    const ignoredRemoteConfigRef = useRef<Config | undefined>(undefined);
    const acceptRemoteTimerRef = useRef<number | undefined>(undefined);
    const savedTimerRef = useRef<number | undefined>(undefined);
    const inFlightSaveRef = useRef<Promise<void> | undefined>(undefined);
    const pendingSaveRef = useRef<PendingSaveCall | undefined>(undefined);

    const showSaved = () => {
        if (savedTimerRef.current !== undefined) window.clearTimeout(savedTimerRef.current);
        setSavedVisible(true);
        savedTimerRef.current = window.setTimeout(() => {
            setSavedVisible(false);
            savedTimerRef.current = undefined;
        }, 1300);
    };

    const scheduleRemoteConfigAcceptance = () => {
        // Keep only one timer for accepting deferred remote config updates.
        if (acceptRemoteTimerRef.current !== undefined) {
            window.clearTimeout(acceptRemoteTimerRef.current);
            acceptRemoteTimerRef.current = undefined;
        }
        acceptRemoteTimerRef.current = window.setTimeout(() => {
            acceptRemoteTimerRef.current = undefined;
            const pending = ignoredRemoteConfigRef.current;
            if (!pending) return;
            ignoredRemoteConfigRef.current = undefined;
            setConfig(pending);
            setLoadError(undefined);
        }, 1000);
    };

    const runSave = (task: () => Promise<void>): Promise<boolean> => {
        // Save coalescing: if one save is running, keep only the latest pending call.
        if (!inFlightSaveRef.current) {
            const run = Promise.resolve().then(task);
            inFlightSaveRef.current = run.finally(() => {
                inFlightSaveRef.current = undefined;
                const next = pendingSaveRef.current;
                pendingSaveRef.current = undefined;
                if (!next) return;
                void runSave(next.task).then(next.resolve, next.reject);
            });
            return run.then(() => true);
        }
        if (pendingSaveRef.current) pendingSaveRef.current.resolve(false);
        return new Promise<boolean>((resolve, reject) => {
            pendingSaveRef.current = {task, resolve, reject};
        });
    };

    const saveConfig = async (nextConfig: Config) => {
        let didRun = false;
        try {
            didRun = await runSave(async () => {
                setSaving(true);
                try {
                    await invokeIpc('config:set', nextConfig);
                    setSaveError(undefined);
                } finally {
                    setSaving(false);
                }
            });
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : String(e));
            return;
        }
        if (!didRun) return;
        showSaved();
    };

    const commitConfig = (nextConfig: Config) => {
        const normalized = normalizeConfig(nextConfig);
        setConfig(normalized);
        scheduleRemoteConfigAcceptance();
        if (!loadError) void saveConfig(normalized);
    };

    useEffect(() => {
        const off = onIpc('config:changed', (rawResult) => {
            try {
                const result = typia.assert<Result<Config>>(rawResult);
                if (result.ok) {
                    if (acceptRemoteTimerRef.current !== undefined) {
                        ignoredRemoteConfigRef.current = result.data;
                        return;
                    }
                    ignoredRemoteConfigRef.current = undefined;
                    setConfig(result.data);
                    setLoadError(undefined);
                    return;
                }
                setLoadError(String(result.error));
            } catch (e) {
                setLoadError(e instanceof Error ? e.message : String(e));
            }
        });
        void invokeIpc('config:request');
        return () => {
            off();
            if (acceptRemoteTimerRef.current !== undefined) {
                window.clearTimeout(acceptRemoteTimerRef.current);
                acceptRemoteTimerRef.current = undefined;
            }
            if (savedTimerRef.current !== undefined) {
                window.clearTimeout(savedTimerRef.current);
                savedTimerRef.current = undefined;
            }
        };
    }, []);

    return {
        config,
        loadError,
        saveError,
        saving,
        savedVisible,
        commitConfig,
    };
}
