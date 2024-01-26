import {Service} from "typedi";
import {ipcMain} from "electron";
import {VrchatTag} from "../GameDevice";
import Buttplug from "../Buttplug";
import Bridge from "../bridge";
import VrcConfigCheck from "../VrcConfigCheck";
import VrchatLogScanner from "./VrchatLogScanner";
import OscConnection from "../OscConnection";
import VrchatOscqueryService from "./VrchatOscqueryService";
import OgbConfigService from "./OgbConfigService";
import MainWindowService from "./MainWindowService";

@Service()
export default class FrontendDataService {

    constructor(
        butt: Buttplug,
        bridge: Bridge,
        vrcConfigCheck: VrcConfigCheck,
        logScanner: VrchatLogScanner,
        oscConnection: OscConnection,
        vrchatOscqueryService: VrchatOscqueryService,
        config: OgbConfigService,
        mainWindowService: MainWindowService
    ) {
        ipcMain.handle('bioStatus:get', async (_event, text) => {
            let bioStatus = '';
            if (butt && butt.wsReady()) {
                const devices = Array.from(bridge.getToys()).map(toy => toy.getStatus());
                devices.sort();
                let devicesStr;
                if (devices.length) {
                    devicesStr = devices.join('\n');
                } else {
                    devicesStr = 'None';
                }
                bioStatus = 'Connected to Intiface!\nConnected Devices:\n' + devicesStr;
            } else {
                bioStatus = 'Not connected to Intiface.\nIs Intiface running?\nDid you click Start Server?';
            }
            return bioStatus;
        });

        ipcMain.handle('tags:get', async () => {
            let tags = bridge.getSources().flatMap(source => source.tags);
            let tagsDistinct = new Set(tags);
            let tagsSorted = Array.from(tagsDistinct).sort();
            return tagsSorted;
        });

        ipcMain.handle('oscStatus:get', async (_event, text) => {

            const sources = bridge.getSources();
            const sections: string[] = [];

            if (vrcConfigCheck.oscEnabled === false) {
                sections.push(`OSC is disabled in your game.\nEnable it in the radial menu:\nOptions > OSC > Enabled`);
            }
            if (vrcConfigCheck.selfInteractEnabled === false) {
                sections.push('Self-Interaction is disabled in your game.\nThis breaks many OGB features.\nEnable it in the quick menu:\nSettings > Avatar Interactions > Self Interact');
            }
            if (vrcConfigCheck.everyoneInteractEnabled === false) {
                sections.push('Interaction is not set to everyone in game.\nEnable it in the quick menu:\nSettings > Avatar Interactions > Everyone');
            }
            if (logScanner.failure) {
                sections.push(`VRChat's log indicated that it failed to start OSC:\n${logScanner.failure}`);
            }

            if (!oscConnection || !oscConnection.socketopen) {
                sections.push(`OSC socket is starting ...`);
            } else {
                sections.push(
                    `OGB OSC: ${oscConnection.port}\n`
                    + `OGB OSCQ: ${oscConnection.useOscQuery ? 'Enabled' : 'Disabled'}\n`
                    + `VRC OSC: ${vrchatOscqueryService.getOscAddress()?.join(':')}\n`
                    + `VRC OSCQ: ${vrchatOscqueryService.getOscqueryAddress()?.join(':')}`
                );
                if (oscConnection && (!oscConnection.lastReceiveTime || oscConnection.lastReceiveTime < Date.now() - 15_000)) {
                    sections.push(`No updates received recently.\nIs the game open and active?`);
                }
                if (oscConnection?.waitingForBulk) {
                    sections.push(`Waiting for bulk packet from OSCQuery`);
                }
            }

            if (vrcConfigCheck.selfInteractEnabled !== false) {
                const hasVrcfHaptics = sources.some(source => source.tags.includes(VrchatTag));
                let isVrcfHapticsUpToDate = false;
                if (oscConnection) {
                    for (const [key, value] of oscConnection.entries()) {
                        if (key == "VFH/Version/9"
                            || key == "VFH/Version/10"
                            || (key.startsWith("OGB/Pen/") && key.endsWith("/Version/8"))
                            || (key.startsWith("OGB/Orf/") && key.endsWith("/Version/9"))
                        ) {
                            isVrcfHapticsUpToDate = true;
                            break;
                        }
                    }
                }
                if (hasVrcfHaptics && !isVrcfHapticsUpToDate) {
                    sections.push('OUTDATED AVATAR DETECTED\n' +
                        'Your avatar was not built using\nthe newest version of VRCFury Haptics.\n' +
                        'Penetration may not work or be less effective.')
                }
            }

            if (sources.length > 0) {
                const globalSourcesLines = sources
                    .map(source => source.tags.join('\n') + '\n= ' + source.value);
                globalSourcesLines.sort();
                sections.push(globalSourcesLines.join('\n\n'));
            }

            return sections.join('\n\n');
        });

        ipcMain.handle('avatarParams:get', async (_event, text) => {
            const map = new Map<string, unknown>();
            if (oscConnection) {
                for (const [key, value] of oscConnection.entries()) {
                    map.set(key, value.get());
                }
            }
            return map;
        });

        ipcMain.handle('fft:status', (_event, level) => {
            if (typeof level != 'number') return;
            if (level < 0 || level > 1 || isNaN(level)) return;
            bridge.receivedFft(level);
        })

        setInterval(() => {
            const mainWindow = mainWindowService.get();
            if (!mainWindow) return;
            mainWindow.webContents.send(config.get().plugins.audio.enabled ? 'fft:start' : 'fft:stop');
        }, 1000);
    }
}