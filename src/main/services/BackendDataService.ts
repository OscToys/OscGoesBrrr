import {Service} from "typedi";
import path from 'path';
import {app, shell} from 'electron';
import typia from "typia";
import {freeze} from "immer";
import AbstractJsonStateService from './AbstractJsonStateService';
import {handleIpc} from '../ipc';
import {recordDeviceHistory, type BackendData} from './backendDataTypes';
import type {PluginDeviceHistoryData} from '../plugins/deviceHistory';

@Service()
export default class BackendDataService extends AbstractJsonStateService<BackendData> {
    private static readonly CURRENT_BACKEND_DATA_VERSION = 1;
    private static readonly DEFAULT_BACKEND_DATA: BackendData = freeze({
        version: BackendDataService.CURRENT_BACKEND_DATA_VERSION,
        deviceHistory: {},
    }, true);

    constructor() {
        super(
            path.join(app.getPath('userData'), 'backendData.json'),
            BackendDataService.DEFAULT_BACKEND_DATA,
            (raw) => typia.assert<BackendData>(raw),
        );
        this.registerIpcHandlers();
    }

    async getAllDeviceHistory() {
        return (await this.get()).deviceHistory;
    }

    async updateDeviceHistory(
        id: string,
        data: PluginDeviceHistoryData,
    ) {
        const now = Date.now();
        await this.mutate((draft) => {
            recordDeviceHistory(draft.deviceHistory, id, data, now);
        });
    }

    private registerIpcHandlers(): void {
        const offReset = handleIpc('backendData:reset', async () => {
            await this.resetToDefaults();
        });

        const offOpen = handleIpc('backendData:open', async () => {
            return await shell.openPath(this.savePath);
        });
        app.once('before-quit', () => {
            offReset();
            offOpen();
        });
    }

}
