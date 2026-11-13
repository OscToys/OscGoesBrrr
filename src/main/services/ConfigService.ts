import {Service} from "typedi";
import '../../common/application/registerPlugins';
import {Config} from "../../common/application/configTypes";
import path from 'path';
import {app, shell} from 'electron';
import {freeze, type Draft} from "immer";
import AbstractJsonStateService, {type NormalizeSource} from "./AbstractJsonStateService";
import MainWindowService from "./MainWindowService";
import {handleIpc} from "../ipc";
import {getDefaultConfig, normalizePluginConfig, upgradeConfig} from "../../common/application/configuration";
import {parseConfig} from '../plugins/configValidation';

@Service()
export default class ConfigService extends AbstractJsonStateService<Config> {
    private static readonly DEFAULT_CONFIG = freeze(getDefaultConfig(), true);

    constructor(
        private readonly mainWindowService: MainWindowService,
    ) {
        super(
            path.join(app.getPath('userData'), 'config.json'),
            ConfigService.DEFAULT_CONFIG,
            parseConfig,
            upgradeConfig,
        );
        this.on('changed', () => this.sendCurrentConfig());
        this.registerIpcHandlers();
    }

    protected override normalizeDraft(draft: Draft<Config>, source: NormalizeSource): void {
        normalizePluginConfig(draft, source);
    }

    protected override getVersionKey(raw: unknown): string | undefined {
        if (raw === null || typeof raw !== 'object') return undefined;
        const config = raw as Partial<Config>;
        return JSON.stringify({
            version: config.version,
            plugins: Object.keys(config.plugins ?? {}).sort().map(id => [id, config.plugins?.[id]?.version]),
        });
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
            const validatedConfig = parseConfig(newConfig);
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
