import fs from "fs/promises";
import path from "path";
import chokidar from "chokidar";
import {produce, type Draft} from "immer";
import TypedEventEmitter from "../../common/TypedEventEmitter";
import isFileMissingError from "../../common/isFileMissingError";

type JsonStateEvents<TData> = {
    changed: (data: TData, loadError: string | undefined) => void;
};

type MutationRecipe<TData> = ((draft: Draft<TData>) => void) | TData;

export abstract class AbstractJsonStateService<TData> extends TypedEventEmitter<JsonStateEvents<TData>> {
    private static readonly EXTERNAL_RELOAD_DEBOUNCE_MS = 200;
    private static readonly SELF_SAVE_SUPPRESS_MS = 1500;

    private processingIo = false;
    private pendingReset = false;
    private pendingLoad = false;
    private pendingSave = false;
    private pendingSavePromise?: Promise<void>;
    private resolvePendingSavePromise?: () => void;
    private rejectPendingSavePromise?: (error: unknown) => void;
    private lastSaveAtMs = 0;
    private externalWatchStarted = false;
    private externalReloadTimer?: NodeJS.Timeout;
    private loadError?: string;
    private resolveInitialLoadPromise: (() => void) | undefined;
    private readonly initialLoadPromise: Promise<void>;

    private data: TData;

    protected constructor(
        protected readonly savePath: string,
        private readonly parseDataFn: (raw: string) => TData,
    ) {
        super();
        this.data = this.getDefaultData();
        this.initialLoadPromise = new Promise<void>((resolve) => {
            this.resolveInitialLoadPromise = resolve;
        });
        this.load();
    }

    async get() {
        await this.ensureInitialLoad();
        return this.data;
    }

    async mutate(mutator: MutationRecipe<TData>): Promise<TData> {
        await this.ensureInitialLoad();
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
        this.data = next;
        this.emitChanged();
        await this.save();
        return this.data;
    }

    getCached() {
        return this.data;
    }

    getLoadError() {
        return this.loadError;
    }

    load() {
        this.pendingLoad = true;
        this.kickIoWorker();
    }

    async resetToDefaults() {
        this.pendingReset = true;
        this.kickIoWorker();
    }

    async startExternalWatch() {
        if (this.externalWatchStarted) return;
        this.externalWatchStarted = true;

        const scheduleReload = () => {
            if (this.externalReloadTimer) clearTimeout(this.externalReloadTimer);
            this.externalReloadTimer = setTimeout(() => {
                this.externalReloadTimer = undefined;
                if (Date.now() - this.lastSaveAtMs < AbstractJsonStateService.SELF_SAVE_SUPPRESS_MS) return;
                this.load();
            }, AbstractJsonStateService.EXTERNAL_RELOAD_DEBOUNCE_MS);
        };

        const watcher = chokidar.watch(this.savePath, {
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 100,
                pollInterval: 25,
            },
        }) as any;
        watcher.on('add', scheduleReload);
        watcher.on('change', scheduleReload);
        watcher.on('unlink', scheduleReload);
    }

    protected emitChanged() {
        this.emit('changed', this.data, this.loadError);
    }

    private save(): Promise<void> {
        this.pendingSave = true;
        if (!this.pendingSavePromise) {
            this.pendingSavePromise = new Promise<void>((resolve, reject) => {
                this.resolvePendingSavePromise = resolve;
                this.rejectPendingSavePromise = reject;
            });
        }
        this.kickIoWorker();
        return this.pendingSavePromise;
    }

    private kickIoWorker() {
        if (this.processingIo) return;
        this.processingIo = true;
        void this.processIoWorker().finally(() => {
            this.processingIo = false;
            if (this.pendingLoad || this.pendingSave) {
                this.kickIoWorker();
            }
        });
    }

    private async processIoWorker() {
        if (this.pendingReset) {
            this.pendingReset = false;
            this.pendingSave = false;
            this.pendingLoad = true;
            // Prevent the watcher from triggering a reload too
            this.lastSaveAtMs = Date.now();
            await fs.rm(this.savePath, {force: true});
        }

        if (this.pendingSave) {
            try {
                while (this.pendingSave) {
                    this.lastSaveAtMs = Date.now(); // This is set before the save on purpose since the watcher could activate any time
                    this.pendingSave = false;
                    this.pendingLoad = false;
                    console.log(`Saving ${path.basename(this.savePath)}`);
                    await fs.mkdir(path.dirname(this.savePath), {recursive: true});
                    await fs.writeFile(this.savePath, JSON.stringify(this.data, null, 2));
                    console.log(`Saved ${path.basename(this.savePath)}`);
                }
                this.pendingSavePromise = undefined;
                this.resolvePendingSavePromise?.();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.log(`Failed to save ${path.basename(this.savePath)}: ${message}`);
                this.pendingSavePromise = undefined;
                this.rejectPendingSavePromise?.(new Error(`Failed to save ${path.basename(this.savePath)}: ${message}`));
            }
        }

        if (this.pendingLoad) {
            try {
                this.pendingLoad = false;
                console.log(`Loading ${path.basename(this.savePath)}`);
                const raw = await fs.readFile(this.savePath, "utf-8");
                const parsed = this.parseDataFn(raw);
                this.data = this.normalizeData(parsed);
                this.loadError = undefined;
                this.emitChanged();
                console.log(`Loaded ${path.basename(this.savePath)}`);
            } catch (error) {
                if (isFileMissingError(error)) {
                    console.log(`Loading default data for ${path.basename(this.savePath)}`);
                    const missing = await this.handleMissingFile() ?? this.getDefaultData();
                    this.data = this.normalizeData(missing);
                    this.loadError = undefined;
                    this.emitChanged();
                    this.save().catch(() => {});
                    console.log(`Loaded default data for ${path.basename(this.savePath)}`);
                    return;
                }
                const message = error instanceof Error ? error.message : String(error);
                this.data = this.getDefaultData();
                this.loadError = `Failed to load ${path.basename(this.savePath)}: ${message}`;
                this.emitChanged();
            } finally {
                this.markInitialLoadDone();
            }
        }
    }

    private ensureInitialLoad(): Promise<void> {
        return this.initialLoadPromise;
    }

    private markInitialLoadDone() {
        this.resolveInitialLoadPromise?.();
        this.resolveInitialLoadPromise = undefined;
    }

    private normalizeData(data: TData): TData {
        return produce(data, (draft) => this.normalizeDraft(draft));
    }

    protected normalizeDraft(_draft: Draft<TData>): void {
        // no-op by default
    }

    protected async handleMissingFile(): Promise<TData | undefined> {
        return undefined;
    }
    protected abstract getDefaultData(): TData;
}

export default AbstractJsonStateService;
