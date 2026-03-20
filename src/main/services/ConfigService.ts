import {Service} from "typedi";
import {Config, Output} from "../../common/configTypes";
import path from 'path';
import {app, shell} from 'electron';
import typia from "typia";
import {freeze, type Draft} from "immer";
import AbstractJsonStateService, {type NormalizeSource} from "./AbstractJsonStateService";
import MainWindowService from "./MainWindowService";
import {handleIpc} from "../ipc";
import LegacyTxtConfigImportService from "./migrate/LegacyTxtConfigImportService";
import {normalizeConfigDraft} from "./configNormalization";

@Service()
export default class ConfigService extends AbstractJsonStateService<Config> {
    private static readonly CURRENT_CONFIG_VERSION = 3;
    private static readonly DEFAULT_CONFIG: Config = freeze({
        version: ConfigService.CURRENT_CONFIG_VERSION,
        useOscQuery: true,
        oscProxy: [],
        outputs: [],
    }, true);

    constructor(
        private readonly legacyTxtConfigImportService: LegacyTxtConfigImportService,
        private readonly mainWindowService: MainWindowService,
    ) {
        super(
            path.join(app.getPath('userData'), 'config.json'),
            ConfigService.DEFAULT_CONFIG,
            (raw) => typia.assert<Config>(raw),
            ConfigService.upgradeRawConfig,
        );
        this.on('changed', () => this.sendCurrentConfig());
        this.registerIpcHandlers();
    }

    getOutput(id: string): Output | undefined {
        return this.getCached().outputs.find(t => t.id === id);
    }

    protected override normalizeDraft(draft: Draft<Config>, source: NormalizeSource): void {
        normalizeConfigDraft(draft, source);
    }

    private static upgradeRawConfig(raw: unknown): unknown {
        const config = raw as Config;
        const version = config.version;
        if (!version || version < 1) {
            throw new Error(`Unknown config version during upgrade: ${version}`);
        }

        if (version > 3) {
            throw new Error(`Unsupported config version: ${version}`);
        }

        if (version < 2) {
            for (const output of config.outputs) {
                for (const link of output.links) {
                    const legacyLink = link as any;
                    if (link.kind === 'vrchat.sps.plug') {
                        legacyLink.ownHands = legacyLink.touchSelf;
                        legacyLink.otherHands = legacyLink.touchOthers;
                        legacyLink.mySockets = legacyLink.penSelf;
                        legacyLink.otherSockets = legacyLink.penOthers;
                        legacyLink.otherPlugs = legacyLink.frotOthers;
                        delete legacyLink.touchSelf;
                        delete legacyLink.touchOthers;
                        delete legacyLink.penSelf;
                        delete legacyLink.penOthers;
                        delete legacyLink.frotOthers;
                        continue;
                    }
                    if (link.kind === 'vrchat.sps.socket') {
                        legacyLink.ownHands = legacyLink.touchSelf;
                        legacyLink.otherHands = legacyLink.touchOthers;
                        legacyLink.myPlugs = legacyLink.penSelf;
                        legacyLink.otherPlugs = legacyLink.penOthers;
                        legacyLink.otherSockets = legacyLink.frotOthers;
                        delete legacyLink.touchSelf;
                        delete legacyLink.touchOthers;
                        delete legacyLink.penSelf;
                        delete legacyLink.penOthers;
                        delete legacyLink.frotOthers;
                        continue;
                    }
                    if (link.kind === 'vrchat.sps.touch') {
                        legacyLink.ownHands = false;
                        legacyLink.otherHands = true;
                    }
                }
            }
            config.version = 2;
        }

        if (version < 3) {
            config.useOscQuery = true;
            config.version = 3;
        }

        return config;
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
