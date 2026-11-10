import {
    IntifaceSendMessageWithType,
    IntifaceOutputType,
    IntifaceOutputCommand,
    Device,
    IntifaceFeatureInformation,
    IntifaceDeviceFeatureSelection,
    selectIntifaceOutput,
} from "./IntifaceProtocol";
import LoggerService, {SubLogger} from "../../../main/services/LoggerService";
import ConfigService from "../../../main/services/ConfigService";
import {Service} from "typedi";
import BackendDataService from '../../../main/services/BackendDataService';
import MdnsRegistryService from "../../../main/services/MdnsRegistryService";
import ImportedOutputPromotionService from "./ImportedOutputPromotionService";
import TypedEventEmitter from "../../../common/TypedEventEmitter";
import clamp from "../../../common/clamp";
import IntifaceSession from "./IntifaceSession";
import type {OutputEndpoint, OutputControlType} from '../../../main/OutputEndpoint';
import type {PluginContext} from '../../../main/plugins/PluginContext';

const getDeviceMotionTypeFromOutputType = (outputType: IntifaceOutputType): OutputControlType => {
    if (outputType === 'Position' || outputType === 'HwPositionWithDuration') return 'linear';
    if (outputType === 'Rotate') return 'rotate';
    return 'vibrate';
};

type MyEvents = {
    addFeature: (device: IntifaceOutput) => void,
    removeFeature: (device: IntifaceOutput) => void
}

@Service()
export default class Intiface extends TypedEventEmitter<MyEvents> {
    features = new Set<IntifaceOutput>();
    reconnectTimer?: ReturnType<typeof setTimeout>;
    reconnectController?: AbortController;
    currentSession?: IntifaceSession;
    lastIntifaceAddress?: string;
    lastUseIntifaceMdns: boolean;
    private logger: SubLogger;
    private signal?: AbortSignal;

    constructor(
        private configService: ConfigService,
        private importedOutputPromotionService: ImportedOutputPromotionService,
        private backendDataService: BackendDataService,
        private mdnsRegistryService: MdnsRegistryService,
        loggerService: LoggerService,
    ) {
        super();
        this.logger = loggerService.get('intifaceLog');
        this.lastIntifaceAddress = this.configService.getCached().intifaceAddress;
        this.lastUseIntifaceMdns = this.configService.getCached().useIntifaceMdns;
    }

    start(context: PluginContext): void {
        this.signal = context.signal;
        const onConfigChanged = (nextConfig: ReturnType<PluginContext['getConfig']>) => {
            for (const feature of this.features) {
                feature.setPreferLinear(this.configService.getOutput(feature.id)?.preferLinear ?? false);
            }
            const nextIntifaceAddress = nextConfig.intifaceAddress;
            const nextUseIntifaceMdns = nextConfig.useIntifaceMdns;
            if (this.lastIntifaceAddress !== nextIntifaceAddress || this.lastUseIntifaceMdns !== nextUseIntifaceMdns) {
                this.requestReconnect(0);
            }
            this.lastIntifaceAddress = nextIntifaceAddress;
            this.lastUseIntifaceMdns = nextUseIntifaceMdns;
        };
        this.configService.on('changed', onConfigChanged);
        context.onCleanup(() => {
            this.configService.off('changed', onConfigChanged);
            this.reconnectController?.abort();
            this.clearReconnectTimer();
            const session = this.currentSession;
            this.currentSession = undefined;
            session?.dispose();
            this.clearDevices();
        });
        this.requestReconnect(0);
    }

    private clearReconnectTimer() {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
    }

    private requestReconnect(delayMs = 1000) {
        if (this.signal?.aborted) return;
        this.reconnectController?.abort();
        this.clearReconnectTimer();
        this.currentSession?.dispose();
        this.currentSession = undefined;
        this.clearDevices();
        const controller = this.reconnectController = new AbortController();
        this.logger.log(delayMs > 0 ? 'retrying shortly ...' : 'retrying ...');
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            void this.connect(controller.signal);
        }, delayMs);
    }

    private async connect(signal: AbortSignal) {
        if (signal.aborted) return;

        const config = await this.configService.get();
        if (signal.aborted) return;
        const uris = config.useIntifaceMdns
            ? [...this.getMdnsUris(), 'ws://127.0.0.1:12345']
            : [this.normalizeUri(config.intifaceAddress ?? 'ws://127.0.0.1:12345')];

        for (const uri of uris) {
            if (signal.aborted) return;
            const session = new IntifaceSession(uri, this.logger);
            session.on('deviceList', devices => this.syncDevices(devices));
            session.on('close', () => {
                if (this.currentSession !== session) return;
                this.currentSession = undefined;
                this.requestReconnect();
            });
            try {
                await session.connect(signal);
            } catch (error) {
                if (!signal.aborted) this.logger.log('Init handshake failed', error);
                session.dispose();
                continue;
            }
            if (signal.aborted) {
                session.dispose();
                return;
            }
            this.currentSession = session;
            return;
        }
        if (!signal.aborted) this.requestReconnect();
    }

    private normalizeUri(normalizedUri: string) {
        let uri;
        try {
            const parsed = new URL(normalizedUri);
            if (parsed.hostname.toLowerCase() === 'localhost') {
                parsed.hostname = '127.0.0.1';
            }
            uri = parsed.toString();
        } catch {
            uri = normalizedUri;
        }
        return uri;
    }

    private getMdnsUris() {
        const uris = new Set<string>();
        for (const service of this.mdnsRegistryService.getServices({type: 'intiface_engine', protocol: 'tcp'})) {
            const path = typeof service.txt?.path === 'string' ? service.txt.path : '/';
            for (const address of service.addresses ?? []) {
                const host = address.includes(':') ? `[${address}]` : address;
                uris.add(`ws://${host}:${service.port}${path.startsWith('/') ? path : `/${path}`}`);
            }
        }
        return [...uris];
    }

    sendAndForget(message: IntifaceSendMessageWithType) {
        const session = this.currentSession;
        if (!session) throw new Error("Not connected");
        return session.sendAndForget(message);
    }

    wsReady() {
        return this.currentSession?.isReady() ?? false;
    }

    getConnectedAddress() {
        return this.currentSession?.getAddress();
    }

    private clearDevices() {
        for (const device of this.features.values()) {
            this.emit('removeFeature', device);
        }
        this.features.clear();
    }

    private syncDevices(devicesByIndex: Record<string, Device>) {
        this.clearDevices();
        const sorted = Object.values(devicesByIndex).sort((a, b) => a.DeviceIndex - b.DeviceIndex);
        for (const device of sorted) {
            this.addDevice(device);
        }
    }

    addDevice(d: Device) {
        const name = d.DeviceName;
        const features = Object.values(d.DeviceFeatures)
            .sort((a, b) => a.FeatureIndex - b.FeatureIndex);
        for (const rawFeature of features) {
            const featureIndex = rawFeature.FeatureIndex;
            const configOutputId = `intiface.${d.DeviceIndex}.${featureIndex}`;
            const selected = selectIntifaceOutput(rawFeature, this.configService.getOutput(configOutputId)?.preferLinear);
            if (!selected) continue;

            void this.importedOutputPromotionService.promoteImportedOutputForDeviceFeature(
                d,
                configOutputId,
                rawFeature,
            ).catch((error) => {
                this.logger.log('Failed to persist imported output promotion', error);
            });

            const intifaceSelection: IntifaceDeviceFeatureSelection = {
                device: d,
                feature: rawFeature,
                selectedOutput: selected,
            };
            const feature = new IntifaceOutput(
                configOutputId,
                this,
                intifaceSelection,
            );

            this.features.add(feature);
            void this.backendDataService
                .updateDeviceHistory(feature.id, {intiface: feature.intiface})
                .catch(e => this.logger.log('Failed to update intiface history', e));
            this.emit('addFeature', feature);
        }
    }

    getDevices() {
        return this.features;
    }
}

export class IntifaceOutput implements OutputEndpoint {
    get type(): OutputControlType { return getDeviceMotionTypeFromOutputType(this.intiface.selectedOutput); }
    private get range() { return this.intiface.feature.Output?.[this.intiface.selectedOutput]?.Value; }
    get intiface() { return this.selection; }
    lastLevel = 0;

    constructor(
        readonly id: string,
        private readonly parent: Intiface,
        private selection: IntifaceDeviceFeatureSelection,
    ) {}

    setPreferLinear(preferLinear: boolean) {
        const selected = selectIntifaceOutput(this.intiface.feature, preferLinear);
        if (!selected || selected === this.intiface.selectedOutput) return;
        // Stop the old oscillation before handing control to position mode.
        if (this.type !== 'linear') this.setLevel(0);
        // Device history freezes its snapshots, so replace rather than mutate the selection.
        this.selection = {...this.selection, selectedOutput: selected};
        this.lastLevel = 0;
    }

    private toValueRange(normalized: number): number {
        const min = this.range?.[0] ?? 0;
        const max = this.range?.[1] ?? 1;
        const t = clamp(normalized, 0, 1);
        const mapped = Math.round(min + (max - min) * t);
        // If we have any level at all, send at least step 1
        if (t > 0.001 && mapped <= min && max > min) {
            return min + 1;
        }
        return mapped;
    }

    private toSignedValueRange(signedNormalized: number): number {
        const min = this.range?.[0] ?? -1;
        const max = this.range?.[1] ?? 1;
        const t = clamp((signedNormalized + 1) / 2, 0, 1);
        const mapped = Math.round(min + (max - min) * t);
        // If we have any level at all, send at least step 1
        if (signedNormalized > 0.001 && mapped <= 0 && max > 0) {
            return 1;
        }
        if (signedNormalized < -0.001 && mapped >= 0 && min < 0) {
            return -1;
        }
        return mapped;
    }

    setLevel(level: number, duration = 0) {
        const selectedOutput = this.intiface.selectedOutput;
        const command: IntifaceOutputCommand = (() => {
            if (selectedOutput === 'HwPositionWithDuration') {
                return {HwPositionWithDuration: {Value: this.toValueRange(level), Duration: Math.max(0, Math.round(duration))}};
            }
            if (selectedOutput === 'Position') {
                return {Position: {Value: this.toValueRange(level)}};
            }
            if (selectedOutput === 'Rotate') {
                const hasSignedRange = (this.range?.[0] ?? 0) < 0;
                if (hasSignedRange) {
                    return {Rotate: {Value: this.toSignedValueRange(level)}};
                }
                return {Rotate: {Value: this.toValueRange(Math.abs(level))}};
            }
            if (selectedOutput === 'Oscillate') {
                return {Oscillate: {Value: this.toValueRange(level)}};
            }
            if (selectedOutput === 'Constrict') {
                return {Constrict: {Value: this.toValueRange(level)}};
            }
            return {Vibrate: {Value: this.toValueRange(level)}};
        })();

        try {
            this.parent.sendAndForget({
                type: 'OutputCmd',
                DeviceIndex: this.intiface.device.DeviceIndex,
                FeatureIndex: this.intiface.feature.FeatureIndex,
                Command: command,
            });
        } catch {}
        this.lastLevel = level;
    }
}
