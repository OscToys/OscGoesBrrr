import {Service} from "typedi";
import {Config, OutputConfig} from "../../common/configTypes";
import path from 'path';
import {app, shell} from 'electron';
import typia from "typia";
import {freeze, type Draft} from "immer";
import AbstractJsonStateService, {type NormalizeSource} from "./AbstractJsonStateService";
import MainWindowService from "./MainWindowService";
import {handleIpc} from "../ipc";
import LegacyTxtConfigImportService from "../plugins/LegacyTxtConfigImportService";
import {normalizeConfigDraft} from "./configNormalization";
import {getDefaultConfig, upgradeConfig} from "../../common/plugins/configuration";

@Service()
export default class ConfigService extends AbstractJsonStateService<Config> {
    private static readonly DEFAULT_CONFIG = freeze(getDefaultConfig(), true);

    constructor(
        private readonly legacyTxtConfigImportService: LegacyTxtConfigImportService,
        private readonly mainWindowService: MainWindowService,
    ) {
        super(
            path.join(app.getPath('userData'), 'config.json'),
            ConfigService.DEFAULT_CONFIG,
            (raw) => typia.assert<Config>(raw),
            upgradeConfig,
        );
        this.on('changed', () => this.sendCurrentConfig());
        this.registerIpcHandlers();
    }

    getOutput(id: string): OutputConfig | undefined {
        return this.getCached().outputs.find(t => t.id === id);
    }

    protected override normalizeDraft(draft: Draft<Config>, source: NormalizeSource): void {
        normalizeConfigDraft(draft, source);
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
