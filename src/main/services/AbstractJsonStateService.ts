import fs from "fs/promises";
import path from "path";
import chokidar, {type FSWatcher} from "chokidar";
import {freeze, produce, type Draft} from "immer";
import TypedEventEmitter from "../../common/TypedEventEmitter";
import isFileMissingError from "../../common/isFileMissingError";

type JsonStateEvents<TData> = {
    changed: (data: TData, loadError: string | undefined) => void;
};

type MutationRecipe<TData> = ((draft: Draft<TData>) => void) | TData;

/**
 * Base service for JSON-backed state with serialized I/O and change notifications.
 *
 * Guarantees:
 * - Single-writer ordering: all state transitions and file I/O are serialized through one internal queue.
 *   Calls to `mutate`, `resetToDefaults`, initial load, and external-reload handling cannot interleave.
 * - Initial-load gating: `get` and `mutate` wait for the initial load attempt to complete.
 * - Load-error gating for mutation: if the current state has a load error, `mutate` rejects until a successful load clears it.
 * - Durable-before-publish for local mutation: successful `mutate` writes to disk before emitting `changed`.
 * - Canonical persistence on load: when loaded JSON is upgraded/normalized/imported, the canonical normalized form is persisted.
 * - Last-known-good retention: on load failure, in-memory data is preserved and only `loadError` is updated.
 * - Runtime immutability of committed state: committed `data` snapshots are deep-frozen via Immer.
 * - Reset behavior: `resetToDefaults` deletes the backing file and then reloads, producing either imported data
 *   (from `handleMissingFile`) or the configured default snapshot.
 * - External file watch debounce: watcher events are debounced and routed through the same serialized queue.
 * - Self-save suppression: watcher reloads are suppressed for a short window after local writes.
 * - Self-write echo skipping: delayed watcher reloads are skipped when file bytes still match the last local write.
 * - Re-entrancy protection: queued commands cannot synchronously enqueue another command while one is running.
 *
 * Notes:
 * - `upgradeRawData` may mutate the provided raw object and should return a parseable shape for `parseDataFn`.
 * - `handleMissingFile` should not call methods that enqueue commands on this service (`mutate`, `resetToDefaults`, etc.).
 */
export abstract class AbstractJsonStateService<TData> extends TypedEventEmitter<JsonStateEvents<TData>> {
    private static readonly EXTERNAL_RELOAD_DEBOUNCE_MS = 200;
    private static readonly SELF_SAVE_SUPPRESS_MS = 1500;

    // Serialize all state transitions and file I/O through one queue.
    private commandQueue: Promise<void> = Promise.resolve();
    private inCommand = false;
    private externalWatchStarted = false;
    private externalWatcher?: FSWatcher;
    private externalReloadTimer?: NodeJS.Timeout;
    private lastWrittenAtMs = 0;
    private lastKnownFileText?: string;
    private loadError?: string;
    private resolveInitialLoadPromise: (() => void) | undefined;
    private readonly initialLoadPromise: Promise<void>;
    private initialLoadDone = false;
    private readonly defaultData: TData;
    private data: TData;

    protected constructor(
        protected readonly savePath: string,
        defaultData: TData,
        private readonly parseDataFn: (raw: unknown) => TData,
        private readonly upgradeRawDataFn?: (raw: unknown) => unknown,
    ) {
        super();
        this.defaultData = freeze(defaultData, true);
        this.data = this.defaultData;
        this.initialLoadPromise = new Promise<void>((resolve) => {
            this.resolveInitialLoadPromise = resolve;
        });
        this.enqueue(async () => {
            try {
                await this.loadFromDisk();
            } finally {
                this.markInitialLoadDone();
            }
        }).catch(()=>{});
    }

    async get() {
        await this.ensureInitialLoad();
        return this.data;
    }

    async mutate(mutator: MutationRecipe<TData>): Promise<TData> {
        return await this.enqueue(async () => {
            if (!this.initialLoadDone) {
                throw this.logAndError(`Mutate ran before initial load completed`);
            }
            const loadError = this.getLoadError();
            if (loadError) throw new Error(loadError);

            let produced;
            if (mutator instanceof Function) {
                produced = produce(this.data, mutator);
            } else {
                produced = mutator;
            }
            const next = this.normalizeData(produced);
            if (Object.is(next, this.data)) return this.data;
            await this.writeDataToDisk(next);
            this.emitChanged(next);
            return this.data;
        });
    }

    getCached() {
        return this.data;
    }

    getLoadError() {
        return this.loadError;
    }

    async startExternalWatch() {
        if (this.externalWatchStarted) return;
        const runReload = () => {
            const remainingSuppressMs = AbstractJsonStateService.SELF_SAVE_SUPPRESS_MS - (Date.now() - this.lastWrittenAtMs);
            if (remainingSuppressMs > 0) {
                this.externalReloadTimer = setTimeout(runReload, remainingSuppressMs);
                return;
            }
            this.externalReloadTimer = undefined;
            this.enqueue(() => this.handleExternalChange()).catch(()=>{});
        };

        const scheduleExternalReload = () => {
            if (this.externalReloadTimer) clearTimeout(this.externalReloadTimer);
            this.externalReloadTimer = setTimeout(runReload, AbstractJsonStateService.EXTERNAL_RELOAD_DEBOUNCE_MS);
        };

        this.externalWatcher = chokidar.watch(this.savePath, {
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 100,
                pollInterval: 25,
            },
        }) as FSWatcher;
        this.externalWatchStarted = true;
        this.externalWatcher.on('add', scheduleExternalReload);
        this.externalWatcher.on('change', scheduleExternalReload);
        this.externalWatcher.on('unlink', scheduleExternalReload);
    }

    protected emitChanged(data: TData, loadError: string | undefined = undefined): void {
        this.data = freeze(data, true);
        this.loadError = loadError;
        this.emit('changed', this.data, this.loadError);
    }

    async dispose(): Promise<void> {
        if (this.externalReloadTimer) {
            clearTimeout(this.externalReloadTimer);
            this.externalReloadTimer = undefined;
        }
        this.externalWatchStarted = false;
        if (!this.externalWatcher) return;
        const watcher = this.externalWatcher;
        this.externalWatcher = undefined;
        await watcher.close();
    }

    protected async resetToDefaults() {
        await this.enqueue(async () => {
            try {
                this.log(`Resetting`);
                this.lastWrittenAtMs = Date.now();
                await fs.rm(this.savePath, {force: true});
                this.lastKnownFileText = undefined;
                await this.loadFromDisk();
                this.log(`Reset`);
            } catch (error) {
                throw this.logAndError(`Failed to reset`, error);
            }
        });
    }

    private logAndError(msg: string, error?: unknown) {
        let full = `[${path.basename(this.savePath)}] ${msg}`;
        if (error) {
            full += `: ${error instanceof Error ? error.message : String(error)}`;
        }
        console.error(full);
        return new Error(full);
    }

    private log(msg: string) {
        const full = `[${path.basename(this.savePath)}] ${msg}`;
        console.log(full);
    }

    private enqueue<TResult>(command: () => Promise<TResult>): Promise<TResult> {
        const runCommand = async () => {
            if (this.inCommand) {
                throw new Error(`[${path.basename(this.savePath)}] Re-entrant state command is not allowed.`);
            }
            this.inCommand = true;
            try {
                return await command();
            } finally {
                this.inCommand = false;
            }
        };
        const task = this.commandQueue.then(runCommand, runCommand);
        this.commandQueue = task.then(() => undefined, () => undefined);
        return task;
    }

    private async handleExternalChange(): Promise<void> {
        let rawText: string | undefined;
        try {
            rawText = await fs.readFile(this.savePath, "utf-8");
            // Skip delayed watcher events when the on-disk bytes still match our last durable write.
            if (rawText === this.lastKnownFileText && this.loadError === undefined) {
                return;
            }
        } catch (error) {
            if (!isFileMissingError(error)) {
                await this.loadFromDisk();
                return;
            }
        }
        await this.loadFromDisk(rawText);
    }

    private async loadFromDisk(prefetchedRawText?: string): Promise<void> {
        try {
            this.log(`Loading`);
            const {normalized, sourceText, shouldPersist} = await this.readAndNormalizeData(prefetchedRawText);
            if (shouldPersist) {
                await this.writeDataToDisk(normalized);
            } else {
                this.lastKnownFileText = sourceText;
            }
            this.emitChanged(normalized);
            this.log(`Loaded`);
        } catch (error) {
            const ex = this.logAndError(`Failed to load`, error);
            this.emitChanged(this.data, ex.message);
            throw ex;
        }
    }

    private async readAndNormalizeData(prefetchedRawText?: string): Promise<{
        normalized: TData;
        sourceText?: string;
        shouldPersist: boolean;
    }> {
        let sourceText = prefetchedRawText;
        let parsedJson: unknown;
        let loadedFromMissingFile = false;

        if (sourceText !== undefined) {
            parsedJson = JSON.parse(sourceText) as unknown;
        } else {
            try {
                sourceText = await fs.readFile(this.savePath, "utf-8");
                parsedJson = JSON.parse(sourceText) as unknown;
            } catch (error) {
                if (!isFileMissingError(error)) throw error;
                this.log(`Attempting to import legacy file`);
                parsedJson = await this.handleMissingFile() ?? this.defaultData;
                loadedFromMissingFile = true;
            }
        }

        const jsonBeforeUpgrade = JSON.stringify(parsedJson);
        const upgradedRaw = this.upgradeRawData(parsedJson);
        const parsed = this.parseDataFn(upgradedRaw);
        const normalized = this.normalizeData(parsed);
        return {
            normalized,
            sourceText,
            shouldPersist: loadedFromMissingFile || jsonBeforeUpgrade !== JSON.stringify(normalized),
        };
    }

    private async writeDataToDisk(data: TData): Promise<void> {
        this.log(`Saving`);
        const serialized = JSON.stringify(data, null, 2);
        this.lastWrittenAtMs = Date.now(); // This is set before the save on purpose since the watcher could activate any time
        await fs.mkdir(path.dirname(this.savePath), {recursive: true});
        await fs.writeFile(this.savePath, serialized);
        this.lastKnownFileText = serialized;
        this.log(`Saved`);
    }

    private ensureInitialLoad(): Promise<void> {
        return this.initialLoadPromise;
    }

    private markInitialLoadDone() {
        this.initialLoadDone = true;
        this.resolveInitialLoadPromise?.();
        this.resolveInitialLoadPromise = undefined;
    }

    private normalizeData(data: TData): TData {
        return produce(data, (draft) => this.normalizeDraft(draft));
    }

    protected normalizeDraft(_draft: Draft<TData>): void {
        // no-op by default
    }

    protected upgradeRawData(raw: unknown): unknown {
        return this.upgradeRawDataFn ? this.upgradeRawDataFn(raw) : raw;
    }

    protected async handleMissingFile(): Promise<TData | undefined> {
        return undefined;
    }
}

export default AbstractJsonStateService;
