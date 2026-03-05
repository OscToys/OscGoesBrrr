import {Service} from "typedi";
import {Config, Output} from "../../common/configTypes";
import {normalizeConfigDraft} from "../../common/configNormalization";
import path from 'path';
import {app, shell} from 'electron';
import typia from "typia";
import type {Draft} from "immer";
import AbstractJsonStateService from "./AbstractJsonStateService";
import MainWindowService from "./MainWindowService";
import {handleIpc} from "../ipc";
import LegacyTxtConfigImportService from "./migrate/LegacyTxtConfigImportService";

@Service()
export default class ConfigService extends AbstractJsonStateService<Config> {
    private static readonly CURRENT_CONFIG_VERSION = 1;

    constructor(
        private readonly legacyTxtConfigImportService: LegacyTxtConfigImportService,
        private readonly mainWindowService: MainWindowService,
    ) {
        super(path.join(app.getPath('userData'), 'config.json'), typia.json.createAssertParse<Config>());
        this.on('changed', () => this.sendCurrentConfig());
        this.registerIpcHandlers();
    }

    getOutput(id: string): Output | undefined {
        return this.getCached().outputs.find(t => t.id === id);
    }

    protected override normalizeDraft(draft: Draft<Config>): void {
        normalizeConfigDraft(draft);
    }

    protected override getDefaultData(): Config {
        return {version: ConfigService.CURRENT_CONFIG_VERSION, oscProxy: [], outputs: []};
    }

    protected override async handleMissingFile(): Promise<Config | undefined> {
        return await this.legacyTxtConfigImportService.migrateFromLegacy();
    }

    private sendCurrentConfig() {
        const loadError = this.getLoadError();
        if (loadError) this.mainWindowService.send('config:changed', {ok: false, error: loadError});
        else this.mainWindowService.send('config:changed', {ok: true, data: this.getCached()});
    }

    private registerIpcHandlers() {
        handleIpc('config:request', async () => {
            this.sendCurrentConfig();
        });

        handleIpc('config:set', async (newConfig) => {
            const validatedConfig = typia.assert<Config>(newConfig);
            await this.mutate(validatedConfig);
        });

        handleIpc('config:reset', async () => {
            await this.resetToDefaults();
        });

        handleIpc('config:open', async () => {
            return await shell.openPath(this.savePath);
        });
    }
}
