import 'reflect-metadata';
import './plugins/registerPlugins';
import 'source-map-support/register';
import {app} from 'electron';
import util from 'util';
import typia from 'typia';
import {Container} from 'typedi';
import Bridge from './bridge';
import Updater from './updater';
import {Plugin} from './plugins/Plugin';
import {collectPluginSettings} from './plugins/settingsState';
import PluginRuntime from './plugins/PluginRuntime';
import ConfigService from './services/ConfigService';
import BackendDataService from './services/BackendDataService';
import MainWindowService from './services/MainWindowService';
import LoggerService from './services/LoggerService';
import {handleIpc} from './ipc';
import type {SettingsStatePayload} from '../common/ipcContract';
import {configurePortableDataPaths} from './portableData';

app.enableSandbox();

if (!app.requestSingleInstanceLock()) {
    app.exit();
    process.exit(0);
}
configurePortableDataPaths(app);

const updater = Container.get(Updater);
const configService = Container.get(ConfigService);
const backendDataService = Container.get(BackendDataService);
const mainWindowService = Container.get(MainWindowService);
const logger = Container.get(LoggerService);
const systemLogger = logger.get('system');
console.log = (...args) => systemLogger.log('LOG', util.format(...args));
console.warn = (...args) => systemLogger.log('WARN', util.format(...args));
console.error = (...args) => systemLogger.log('ERROR', util.format(...args));

const bridge = Container.get(Bridge);
const plugins = Container.getMany(Plugin.token);
const runtime = new PluginRuntime(plugins, {
    getConfig: () => configService.getCached(),
    getOutputs: () => Array.from(bridge.getOutputs(), ({output}) => ({
        id: output.id,
        config: configService.getOutput(output.id),
    })),
    handleIpc,
    send: (channel, ...args) => mainWindowService.send(channel, ...args),
});
const pluginsReady = runtime.start().then(started => {
    if (started) bridge.start();
});
app.once('before-quit', () => {
    bridge.stop();
    try { runtime.stop(); } catch (error) { console.error('Plugin cleanup failed', error); }
});
void pluginsReady.catch(error => console.error('Plugin startup failed', error));

handleIpc('settings-state:request', async () => {
    try {
        await pluginsReady;
        await backendDataService.get();
        const loadError = backendDataService.getLoadError();
        if (loadError) throw new Error(loadError);
        const outputs = Array.from(bridge.getOutputs());
        const state = {
            ...await collectPluginSettings(plugins, outputs),
            updateAvailable: updater.getAvailableUpdate(),
        };
        mainWindowService.send('settings-state:changed', {
            ok: true,
            data: typia.assert<SettingsStatePayload>(state),
        });
    } catch (error) {
        mainWindowService.send('settings-state:changed', {ok: false, error: String(error)});
    }
});

configService.startExternalWatch().catch(error => {
    console.error('Failed to start external config watch', error);
});

