import {Service} from "typedi";
import path from 'path';
import {app, shell} from 'electron';
import typia from "typia";
import {freeze} from "immer";
import AbstractJsonStateService from "./AbstractJsonStateService";
import {handleIpc} from "../ipc";
import type {IntifaceDeviceFeatureSelection} from "../ButtplugSpec";

export interface DeviceHistoryItem {
    intiface: IntifaceDeviceFeatureSelection;
    firstSeen: number;
    lastSeen: number;
}

export interface DeviceHistory {
    [id: string]: DeviceHistoryItem;
}

export interface BackendData {
    version: number;
    deviceHistory: DeviceHistory;
}

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
        intiface: IntifaceDeviceFeatureSelection,
    ) {
        const now = Date.now();
        await this.mutate((draft) => {
            const previous = draft.deviceHistory[id];
            draft.deviceHistory[id] = {
                intiface,
                firstSeen: previous?.firstSeen ?? now,
                lastSeen: now,
            };
        });
    }

    private registerIpcHandlers() {
        handleIpc('backendData:reset', async () => {
            await this.resetToDefaults();
        });

        handleIpc('backendData:open', async () => {
            return await shell.openPath(this.savePath);
        });
    }

}
