import {Plugin, PluginService} from '../../../main/plugins/Plugin';
import VrchatDiagnostics from './VrchatDiagnostics';
import OscQueryHttpServerService from './OscQueryHttpServerService';
import OscQueryMdnsBroadcastService from './OscQueryMdnsBroadcastService';
import type {PluginContext} from '../../../main/plugins/PluginContext';
import OscConnection, {type OscValue} from './OscConnection';
import AvatarZone, {type AvatarZoneType} from './AvatarZone';
import type {OutputLink} from '../../../common/configTypes';
import {getSettings, isVrchatLink, PLUGIN_ID} from '../shared/config';
import type {InputSample} from '../../../main/routing';
import type {LinkInputResolver} from '../../../main/plugins/linkInputs';

/** Resolve only VRChat links; unknown integrations are left to other adapters. */
export function resolveVrchatLink(
    link: OutputLink,
    index: number,
    linear: boolean,
    zones: readonly AvatarZone[],
    parameters: ReadonlyMap<string, unknown>,
): InputSample[] | undefined {
    if (!isVrchatLink(link)) return undefined;
    if (link.kind === 'vrchat.avatarParameter') {
        const parameter = link.parameter.trim();
        if (!parameter) return [];
        const raw = parameters.get(parameter);
        const value = typeof raw === 'number' ? raw : raw === true ? 1 : 0;
        return [{id: `${index}/${parameter}`, value, kind: 'intensity'}];
    }
    if (link.kind !== 'vrchat.sps.plug' && link.kind !== 'vrchat.sps.socket' && link.kind !== 'vrchat.sps.touch') return undefined;
    const eyeHeight = parameters.get('EyeHeightAsMeters');
    // Native contact velocity is world-space. Preserve the old sensitivity at 1.5 m.
    const velocityScale = typeof eyeHeight === 'number' && Number.isFinite(eyeHeight) && eyeHeight > 0
        ? 1.5 / eyeHeight : 1;
    return zones.flatMap(zone => zone.getSources(link, !linear).map(source => ({
        ...source,
        id: `${index}/${source.id}`,
        value: source.kind === 'speed' ? source.value * velocityScale : source.value,
    })));
}

/** Historical names are accepted only at the OSC boundary. */
export function decodeZoneFormat(wireType: string): {type: AvatarZoneType; advancedDepth: boolean} | undefined {
    switch (wireType) {
        case 'Pen': return {type: 'plug', advancedDepth: false};
        case 'Orf': return {type: 'socket', advancedDepth: false};
        case 'Plug': return {type: 'plug', advancedDepth: true};
        case 'Socket': return {type: 'socket', advancedDepth: true};
        case 'Touch': return {type: 'touch', advancedDepth: false};
        default: return undefined;
    }
}

/** Owns discovery and compatibility decoding for avatar contact inputs. */
@PluginService()
export default class VrchatPlugin extends Plugin {
    readonly id = PLUGIN_ID;
    private context?: PluginContext;
    override async start(context: PluginContext) {
        this.context = context;
        this.osc.on('add', this.onParameterAdded);
        this.osc.on('clear', this.onAvatarCleared);
        context.onCleanup(() => {
            this.context = undefined;
            this.osc.off('add', this.onParameterAdded);
            this.osc.off('clear', this.onAvatarCleared);
            this.onAvatarCleared();
        });
        // Discovery also works when OSC values arrive before plugin startup.
        for (const [key, value] of this.osc.entries()) this.onParameterAdded(key, value);
        this.osc.start(context);
        this.diagnostics.start(context);
        context.handleIpc('avatarParams:get', () => new Map(
            Array.from(this.osc.entries(), ([key, value]) => [key, value.get()]),
        ));
        await this.httpServer.start(context);
        this.mdnsBroadcast.start(context);
    }

    override async settingsState() {
        return this.diagnostics.getState(this.getAvatarZones(), this.hasHapticsDisabled());
    }
    private readonly zones = new Map<string, AvatarZone>();

    constructor(
        private readonly osc: OscConnection,
        private readonly diagnostics: VrchatDiagnostics,
        private readonly httpServer: OscQueryHttpServerService,
        private readonly mdnsBroadcast: OscQueryMdnsBroadcastService,
    ) {
        super();
    }

    private onParameterAdded = (key: string, value: OscValue) => {
        const parts = key.split('/');
        if (parts[0] === 'OGB' || parts[0] === 'TPS_Internal') {
            const isTps = parts[0] === 'TPS_Internal';
            const type = parts[1];
            const id = parts[2];
            const contact = parts.slice(3).join('/');
            if (!type || !id || !contact || !['Plug', 'Socket', 'Pen', 'Orf', 'Touch'].includes(type)) return;
            this.addContact(`${isTps}__${type}__${id}`, type, id, isTps, contact, value);
        }
        if (parts[0] === 'VFH' && parts[1] === 'Zone') {
            const type = parts[2];
            const id = parts[3];
            const contact = parts[4];
            if (!type || !id || !contact) return;
            this.addContact(`${type}__${id}`, type, id, false, contact, value);
        }
    };

    private addContact(
        key: string,
        type: string,
        id: string,
        isTps: boolean,
        contact: string,
        value: OscValue,
    ) {
        let zone = this.zones.get(key);
        if (!zone) {
            const format = decodeZoneFormat(type);
            if (!format) return;
            zone = new AvatarZone(format.type, id, isTps, format.advancedDepth);
            this.zones.set(key, zone);
        }
        zone.addKey(contact, value);
    }

    private onAvatarCleared = () => {
        for (const zone of this.zones.values()) zone.dispose();
        this.zones.clear();
    };

    hasHapticsDisabled(): boolean {
        const disabled = this.osc.entries().get('OGB/HapticsDisabled')?.get();
        return disabled === true || disabled === 1;
    }

    getAvatarZones(): AvatarZone[] {
        const zones = Array.from(this.zones.values());
        const hasOgb = zones.some(zone => !zone.isTps);
        return zones.filter(zone => !hasOgb || !zone.isTps);
    }

    override snapshot(): LinkInputResolver {
        const zones = this.getAvatarZones();
        const parameters = new Map(Array.from(this.osc.entries(), ([key, value]) => [key, value.get()]));
        return (link, index, linear) => isVrchatLink(link) ? {
            inputs: resolveVrchatLink(link, index, linear, zones, parameters) ?? [],
            modifiers: link.mutators,
        } : undefined;
    }

    override afterUpdate(outputLevel: number) {
        this.osc.clearDeltas();
        const parameter = this.context ? getSettings(this.context.getConfig()).maxLevelParam : undefined;
        if (parameter) this.osc.send(parameter, outputLevel);
    }
}
