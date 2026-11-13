import {Service} from 'typedi';
import ConfigService from '../../../main/services/ConfigService';
import type AvatarZone from './AvatarZone';
import OscConnection from './OscConnection';
import VrcConfigCheck from './VrcConfigCheck';
import VrchatOscqueryService from './VrchatOscqueryService';
import VrchatLogScanner from './VrchatLogScanner';
import VrchatLogFinder from './VrchatLogFinder';
import OscQueryPortService from './OscQueryPortService';
import type {SettingsStatePayload} from '../../../common/application/ipcContract';
import type {PluginContext} from '../../../main/plugins/PluginContext';
import {getSettings} from '../shared/config';

@Service()
export default class VrchatDiagnostics {
    constructor(
        private readonly configService: ConfigService,
        private readonly oscConnection: OscConnection,
        private readonly vrcConfigCheck: VrcConfigCheck,
        private readonly vrchatOscqueryService: VrchatOscqueryService,
        private readonly logScanner: VrchatLogScanner,
        private readonly vrchatLogFinder: VrchatLogFinder,
        private readonly oscQueryPortService: OscQueryPortService,
    ) {}

    start(context: PluginContext): void {
        this.vrcConfigCheck.start(context);
        this.vrchatOscqueryService.start(context);
        this.logScanner.start(context);
    }

    async getState(avatarZones: readonly AvatarZone[], hapticsDisabled: boolean): Promise<Partial<SettingsStatePayload>> {
        const {
            configService,
            oscConnection,
            vrcConfigCheck,
            vrchatOscqueryService,
            logScanner,
            vrchatLogFinder,
            oscQueryPortService,
        } = this;
        const maskUserInPath = (raw: string) => raw.replace(/(Users[\\/])([^\\/]+)/i, '$1***');
        const vrchatConnected = oscConnection.isGameOpenAndActive();
        const detectedVrcConfigDirs = await vrchatLogFinder.getDetectedVrcConfigDir();
        const hasSpsZones = avatarZones.length > 0;
        const detectedSpsPlugIds = Array.from(new Set(avatarZones.filter(device => device.type === 'plug').map(device => device.id))).sort();
        const detectedSpsSocketIds = Array.from(new Set(avatarZones.filter(device => device.type === 'socket').map(device => device.id))).sort();
        const detectedSpsTouchZoneIds = Array.from(new Set(avatarZones.filter(device => device.type === 'touch').map(device => device.id))).sort();
        const oscStatusSnapshot = oscConnection.getStatusSnapshot();
        const oscqueryStatus = vrchatOscqueryService.getStatus();
        const useOscQuery = getSettings(configService.getCached()).useOscQuery;
        const oscQueryPort = useOscQuery ? await oscQueryPortService.get() : undefined;
        const ogbOscPort = oscConnection.socketopen ? (useOscQuery ? oscQueryPort : 9001) : undefined;
        const ogbOscqueryPort = oscQueryPort;
        const vrcOscPort = vrchatOscqueryService.getOscAddress()?.[1];
        const vrcOscqueryPort = vrchatOscqueryService.getOscqueryAddress()?.[1];

        const hasVrcfHaptics = avatarZones.length > 0;
        let isVrcfHapticsUpToDate = false;
        for (const [key] of oscConnection.entries()) {
            if (key == "OGB/Version/11"
                    || key == "VFH/Version/9"
                    || key == "VFH/Version/10"
                    || (key.startsWith("OGB/Pen/") && key.endsWith("/Version/8"))
                    || (key.startsWith("OGB/Orf/") && key.endsWith("/Version/9"))
            ) {
                isVrcfHapticsUpToDate = true;
                break;
            }
        }
        const outdatedAvatarDetected = hasVrcfHaptics && !isVrcfHapticsUpToDate;


        return {
            vrchat: {
                connected: vrchatConnected,
                diagnostics: {
                    hasSpsZones,
                    hapticsDisabled,
                    outdatedAvatarDetected,
                    oscEnabled: vrcConfigCheck.oscEnabled === false,
                    selfInteract: vrcConfigCheck.selfInteractEnabled === false,
                    everyoneInteract: vrcConfigCheck.everyoneInteractEnabled === false,
                    loggingFull: vrcConfigCheck.loggingFull !== false,
                    oscStartup: Boolean(logScanner.failure),
                    oscStartupText: logScanner.failure,
                    ogbOscPort,
                    ogbOscqueryPort,
                    vrcOscPort,
                    vrcOscqueryPort,
                    oscStatus: oscStatusSnapshot.status,
                    oscqueryStatus,
                    oscqueryWaitingForBulk: oscStatusSnapshot.oscqueryWaitingForBulk,
                    logsFound: vrchatOscqueryService.getLogsFound(),
                    detectedVrcConfigDirs: detectedVrcConfigDirs.map(path => maskUserInPath(path) ?? path),
                },
                detectedSpsPlugIds,
                detectedSpsSocketIds,
                detectedSpsTouchZoneIds,
            },
        };
    }
}

