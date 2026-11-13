import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test, type TestContext} from 'node:test';
import PluginRuntime from '../../../main/plugins/PluginRuntime';
import {createPluginHost} from '../../../main/plugins/testHost';
import AvatarZone from './AvatarZone';
import OutputController from '../../../main/OutputController';
import {collectLinkInputs, type LinkInputResolver} from '../../../main/plugins/linkInputs';
import {getDefaultConfig} from '../../../common/application/configuration';
import VrchatPlugin, {decodeZoneFormat, resolveVrchatLink} from './VrchatPlugin';
import type OscConnection from './OscConnection';
import type {OscValue} from './OscConnection';
import type {OutputEndpoint} from '../../../main/OutputEndpoint';
import TypedEventEmitter from '../../../common/TypedEventEmitter';
import {getDefaultLinks, type OutputConfig, type OutputLink} from '../../../common/application/configTypes';
import {createInteraction, isVrchatLink, type ZoneLink} from '../shared/config';

async function createPlugin(osc: Connection, t: TestContext, getConfig = getDefaultConfig) {
    const plugin = new VrchatPlugin(
        osc as unknown as OscConnection,
        {start() {}} as unknown as ConstructorParameters<typeof VrchatPlugin>[1],
        {async start() {}} as unknown as ConstructorParameters<typeof VrchatPlugin>[2],
        {start() {}} as unknown as ConstructorParameters<typeof VrchatPlugin>[3],
    );
    const {host} = createPluginHost();
    host.getConfig = getConfig;
    const runtime = new PluginRuntime([plugin], host);
    t.after(() => runtime.stop());
    await runtime.start();
    return plugin;
}

type SpsLink = ZoneLink;

class Value extends TypedEventEmitter<{change: (oldValue: unknown, newValue: unknown) => void}> {
    constructor(private value: unknown) { super(); }
    get() { return this.value; }
    set(next: unknown) {
        const previous = this.value;
        this.value = next;
        this.emit('change', previous, next);
    }
}

function link(kind: SpsLink['kind'], movement = false): SpsLink {
    const result = getDefaultLinks().find((item): item is SpsLink => item.kind === kind)!;
    result.hands = createInteraction(true, true, movement ? 'movement' : 'proximity');
    if (result.kind === 'vrchat.sps.plug') {
        result.sockets = createInteraction(true, true, 'proximity');
        result.plugs = createInteraction(false, true, movement ? 'movement' : 'proximity');
    }
    if (result.kind === 'vrchat.sps.socket') {
        result.plugs = createInteraction(true, true, 'proximity');
        result.sockets = createInteraction(false, true, movement ? 'movement' : 'proximity');
    }
    return result;
}

function device(type: string, initial: Record<string, unknown> = {}, isTps = false) {
    const format = decodeZoneFormat(type)!;
    const output = new AvatarZone(format.type, 'Test', isTps, format.advancedDepth);
    const values = new Map<string, Value>();
    const set = (key: string, value: unknown) => {
        const existing = values.get(key);
        if (existing) existing.set(value);
        else {
            const entry = new Value(value);
            values.set(key, entry);
            output.addKey(key, entry as unknown as OscValue);
        }
    };
    for (const [key, value] of Object.entries(initial)) set(key, value);
    const source = (key: string) => {
        const kind = output.type === 'plug' ? 'vrchat.sps.plug' : output.type === 'socket' ? 'vrchat.sps.socket' : 'vrchat.sps.touch';
        return output.getSources(link(kind, true)).find(item => item.id.endsWith('/' + key))!;
    };
    return {output, set, source};
}

function near(actual: number, expected: number) {
    assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`);
}

test('wire aliases decode to canonical zone types with independent depth-format flags', () => {
    assert.deepEqual(decodeZoneFormat('Pen'), {type: 'plug', advancedDepth: false});
    assert.deepEqual(decodeZoneFormat('Plug'), {type: 'plug', advancedDepth: true});
    assert.deepEqual(decodeZoneFormat('Orf'), {type: 'socket', advancedDepth: false});
    assert.deepEqual(decodeZoneFormat('Socket'), {type: 'socket', advancedDepth: true});
    assert.deepEqual(decodeZoneFormat('Touch'), {type: 'touch', advancedDepth: false});
    assert.equal(decodeZoneFormat('Version'), undefined);
});

for (const self of [true, false]) {
    const contact = self ? 'DepthSelf' : 'DepthOthers';
    const source = self ? 'depthSelf' : 'depthOthers';
    test(`SPS3 plug ${contact} reconstructs live length from both multipliers`, () => {
        const plug = device('Plug', {LengthMult1: 0.01, LengthMult2: 40, [contact]: 1, [contact + '_PointSeparation']: 0.1});
        assert.equal(plug.output.type, 'plug');
        near(plug.source(source).value, 0.75);
        plug.set('LengthMult1', 0.02);
        near(plug.source(source).value, 0.875);
        plug.set(contact + '_PointSeparation', 0);
        near(plug.source(source).value, 1);
        plug.set(contact + '_PointSeparation', 1);
        near(plug.source(source).value, 0);
        plug.set(contact + '_PointSeparation', -1);
        near(plug.source(source).value, 0);
    });

    test(`SPS3 socket ${contact} uses native tags and sender length at saturation`, () => {
        const socket = device('Socket', {
            [contact]: 1, [contact + '_PointSeparation']: 0.1, [contact + '_SenderLossyScaleZ']: 0.4,
            [contact + '_CollisionTag_SPS/Plug/_public']: true,
        });
        assert.equal(socket.output.type, 'socket');
        near(socket.source(source).value, 0.75);
        socket.set(contact + '_SenderLossyScaleZ', 0.8);
        near(socket.source(source).value, 0.875);
        socket.set(contact, 0);
        near(socket.source(source).value, 0);
        socket.set(contact, 1);
        socket.set(contact + '_PointSeparation', -1);
        near(socket.source(source).value, 0);
    });
}

for (const invalid of [0, -1, undefined, NaN, Infinity]) {
    test(`invalid plug length ${String(invalid)} does not produce haptics`, () => {
        const plug = device('Plug', {LengthMult1: invalid, LengthMult2: 40, DepthOthers: 1, DepthOthers_PointSeparation: 0});
        assert.equal(plug.source('depthOthers').value, 0);
    });
}

test('legacy plug on an SPS3 socket uses advertised receiver radius and caches length through penetration', () => {
    const socket = device('Socket', {DepthRadius: 0.2, DepthOthers: 0.5, DepthOthers_PointSeparation: 0.5,
        DepthOthers_SenderLossyScaleZ: 99});
    near(socket.source('depthOthers').value, 0);
    socket.set('DepthOthers', 1);
    socket.set('DepthOthers_PointSeparation', 0.2);
    near(socket.source('depthOthers').value, 0.5);
    socket.set('DepthOthers_PointSeparation', 0.1);
    near(socket.source('depthOthers').value, 0.75);
    socket.set('DepthOthers', 0);
    socket.set('DepthOthers_PointSeparation', -1);
    socket.set('DepthOthers_PointSeparation', 0.3);
    socket.set('DepthOthers', 1);
    near(socket.source('depthOthers').value, 0);
    socket.set('DepthOthers_PointSeparation', 0.15);
    near(socket.source('depthOthers').value, 0.5);
});

for (const proximityFirst of [true, false]) {
    test(`legacy length refreshes while unsaturated with ${proximityFirst ? 'proximity' : 'separation'} first`, () => {
        const socket = device('Socket', {DepthRadius: 1, DepthOthers: 0.7, DepthOthers_PointSeparation: 0.7});
        const updates: [string, number][] = [
            ['DepthOthers', 0.8], ['DepthOthers_PointSeparation', 0.8],
        ];
        if (!proximityFirst) updates.reverse();
        for (const [key, value] of updates) socket.set(key, value);
        socket.set('DepthOthers', 1);
        socket.set('DepthOthers_PointSeparation', 0.3);
        near(socket.source('depthOthers').value, 0.5);
    });
}

test('legacy length estimates support plugs larger than the receiver and never interpret scale without native tags', () => {
    const socket = device('Socket', {DepthRadius: 0.1, DepthOthers: 0.5, DepthOthers_PointSeparation: 1.25,
        DepthOthers_SenderLossyScaleZ: 5000});
    socket.set('DepthOthers', 1);
    socket.set('DepthOthers_PointSeparation', 0.6);
    near(socket.source('depthOthers').value, 0.5);
    socket.set('DepthOthers_CollisionTag_SPS/Plug/private', 1);
    socket.set('DepthOthers_SenderLossyScaleZ', 0.8);
    near(socket.source('depthOthers').value, 0.25);
    socket.set('DepthOthers_CollisionTag_SPS/Plug/private', 0);
    near(socket.source('depthOthers').value, 0);
});

for (const [type, contact, source] of [
    ['Plug', 'TouchSelf', 'touchSelf'], ['Plug', 'TouchOthers', 'touchOthers'], ['Plug', 'FrotOthers', 'frotOthers'],
    ['Socket', 'TouchSelf', 'touchSelf'], ['Socket', 'TouchOthers', 'touchOthers'],
    ['Touch', 'Self', 'touchSelf'], ['Touch', 'Others', 'touchOthers'],
    ['Pen', 'FrotOthers', 'frotOthers'], ['Orf', 'TouchOthers', 'touchOthers'],
    ['Socket', 'FrotOthers', 'frotOthers'], ['Pen', 'TouchSelf', 'touchSelf'],
    ['Pen', 'TouchOthers', 'touchOthers'], ['Orf', 'TouchSelf', 'touchSelf'], ['Orf', 'FrotOthers', 'frotOthers'],
] as const) {
    test(`${type}/${contact} uses magnitude exclusively when present, including zero and missing contact`, () => {
        const zone = device(type, {[contact]: 0.9, [contact + 'Close']: true, [contact + '_SenderVelocityMagnitude']: 0.4});
        near(zone.source(source).value, 0.4);
        assert.equal(zone.source(source).kind, 'speed');
        const proximity = zone.output.getSources(link(`vrchat.sps.${zone.output.type}`))
            .find(input => input.id.endsWith('/' + source))!;
        near(proximity.value, 0.9);
        assert.equal(proximity.kind, 'position');
        assert.equal(proximity.movement, false);
        assert.equal(zone.source(source).movement, true);
        for (const speed of [0, undefined, -1, NaN, Infinity]) {
            zone.set(contact + '_SenderVelocityMagnitude', speed);
            assert.equal(zone.source(source).value, 0);
            assert.equal(zone.source(source).kind, 'speed');
        }
        zone.set(contact + '_SenderVelocityMagnitude', 8);
        zone.set(contact, 0);
        assert.equal(zone.source(source).value, 0);
    });
}

test('old Pen/Orf/Touch outputs retain proximity, close gating and penetration behavior', () => {
    const plug = device('Pen', {TouchSelf: 0.8, TouchOthers: 0.7, PenSelf: 0.6, PenOthers: 0.5, FrotOthers: 0.4});
    assert.equal(plug.source('touchSelf').value, 0);
    assert.equal(plug.source('frotOthers').value, 0);
    plug.set('TouchSelfClose', true);
    plug.set('FrotOthersClose', true);
    near(plug.source('touchSelf').value, 0.8);
    near(plug.source('frotOthers').value, 0.4);
    near(plug.source('depthSelf').value, 0.6);
    near(plug.source('depthOthers').value, 0.5);
    assert.notEqual(plug.source('touchSelf').kind, 'speed');
    const socket = device('Orf', {PenSelf: 0.6, PenOthers: 0.5, FrotOthers: 0.4});
    near(socket.source('depthSelf').value, 0.6);
    near(socket.source('depthOthers').value, 0.5);
    near(socket.source('frotOthers').value, 0.4);
    socket.set('PenOthersClose', false);
    near(socket.source('depthOthers').value, 0);
    const touch = device('Touch', {Self: 0.2, Others: 0.3});
    near(touch.source('touchSelf').value, 0.2);
    near(touch.source('touchOthers').value, 0.3);
});

test('old socket root/tip measurements still override old penetration outputs', () => {
    const socket = device('Orf', {PenOthers: 0.9, PenOthersNewRoot: 0.5, PenOthersNewTip: 0.9});
    for (let i = 0; i < 6; i++) {
        socket.set('PenOthersNewRoot', 0.5);
        socket.set('PenOthersNewTip', 0.9);
    }
    socket.set('PenOthersNewRoot', 0.7);
    socket.set('PenOthersNewTip', 1);
    near(socket.source('depthOthers').value, 0.25);
});

test('new contacts without magnitude can still use proximity and existing ID filters', () => {
    const plug = device('Plug', {TouchOthers: 0.6, FrotOthers: 0.4});
    near(plug.source('touchOthers').value, 0.6);
    near(plug.source('frotOthers').value, 0.4);
    const selection = link('vrchat.sps.plug');
    selection.filter.include = ['Different'];
    assert.deepEqual(plug.output.getSources(selection), []);
    selection.filter.include = [' Test '];
    assert.ok(plug.output.getSources(selection).length > 0);
    selection.filter.exclude = ['Test'];
    assert.deepEqual(plug.output.getSources(selection), []);
});

function outputFor() {
    return new OutputController({
        type: 'vibrate',
        lastLevel: 0,
        setLevel() {},
    } satisfies OutputEndpoint);
}

function linkResults(output: OutputController, zones: AvatarZone[], config: OutputConfig) {
    const inputs = collectLinkInputs(config.links, output.output.type === 'linear', new Map<string, LinkInputResolver>([
        ['vrchat', (link, index, linear) => isVrchatLink(link) ? {
            inputs: resolveVrchatLink(link, index, linear, zones, new Map()) ?? [],
            modifiers: link.mutators,
        } : undefined],
    ]));
    return output.getLinkOutputs(inputs, 100);
}

// Keep historical wire formats separate: aliases do not imply identical close gating.
for (const type of ['Pen', 'Orf', 'Plug', 'Socket', 'Touch']) {
    const contacts = type === 'Touch'
        ? [['Self', 'touchSelf'], ['Others', 'touchOthers']]
        : [['TouchSelf', 'touchSelf'], ['TouchOthers', 'touchOthers'], ['FrotOthers', 'frotOthers']];
    for (const [contact, key] of contacts as [string, string][]) {
        test(`${type}/${contact} proximity close flag missing, false, true, and cleared`, () => {
            const zone = device(type, {[contact]: 0.7});
            const needsClose = type === 'Pen' || type === 'Orf' && contact !== 'FrotOthers';
            near(zone.source(key).value, needsClose ? 0 : 0.7);
            assert.equal(zone.source(key).kind, 'position');
            zone.set(contact + 'Close', false);
            near(zone.source(key).value, needsClose ? 0 : 0.7);
            zone.set(contact + 'Close', true);
            near(zone.source(key).value, 0.7);
            zone.set(contact + 'Close', false);
            near(zone.source(key).value, needsClose ? 0 : 0.7);
        });
    }
}

for (const type of ['Pen', 'Orf']) {
    for (const self of [true, false]) {
        const contact = self ? 'PenSelf' : 'PenOthers';
        const key = self ? 'depthSelf' : 'depthOthers';
        test(`${type}/${contact} legacy depth and optional close gating`, () => {
            const zone = device(type, {[contact]: 0.6});
            near(zone.source(key).value, 0.6);
            zone.set(contact + 'Close', false);
            near(zone.source(key).value, type === 'Orf' && !self ? 0 : 0.6);
            zone.set(contact + 'Close', true);
            near(zone.source(key).value, 0.6);
        });
    }
}

for (const self of [true, false]) {
    const contact = self ? 'PenSelf' : 'PenOthers';
    const key = self ? 'depthSelf' : 'depthOthers';
    test(`Orf ${contact} root/tip discovery, saturation, fallback, and independent party history`, () => {
        const zone = device('Orf', {[contact]: 0.8});
        const other = self ? 'PenOthers' : 'PenSelf';
        zone.set(other + 'NewRoot', 0.2);
        zone.set(other + 'NewTip', 0.8);
        zone.set(contact + 'NewRoot', 0.5);
        near(zone.source(key).value, 0.8);
        zone.set(contact + 'NewTip', 0.9);
        for (let i = 0; i < 6; i++) {
            zone.set(contact + 'NewRoot', 0.5);
            zone.set(contact + 'NewTip', 0.9);
        }
        near(zone.source(key).value, 0); // Present, but not yet penetrating: no legacy fallback.
        zone.set(contact + 'NewRoot', 0.7);
        zone.set(contact + 'NewTip', 1);
        near(zone.source(key).value, 0.25);
        zone.set(contact + 'Close', false);
        near(zone.source(key).value, 0.25); // Close only gates the older single-value depth.
        zone.set(contact + 'NewRoot', 0);
        zone.set(contact + 'NewTip', 0);
        near(zone.source(key).value, self ? 0.8 : 0);
        zone.set(contact + 'Close', true);
        near(zone.source(key).value, 0.8);
    });
}

for (const type of ['Pen', 'Orf']) {
    test(`TPS ${type} uses only its own depth field and respects enable/filter settings`, () => {
        const zone = device(type, {RootRoot: 0.3, Depth_In: 0.7, PenOthers: 1, TouchOthers: 1,
            TouchOthers_SenderVelocityMagnitude: 1}, true);
        const selection = link(type === 'Pen' ? 'vrchat.sps.plug' : 'vrchat.sps.socket');
        const samples = zone.output.getSources(selection);
        assert.equal(samples.length, 1);
        near(samples[0]!.value, type === 'Pen' ? 0.3 : 0.7);
        assert.equal(samples[0]!.kind, 'position');
        if (selection.kind === 'vrchat.sps.plug') selection.sockets.mode = 'off';
        else if (selection.kind === 'vrchat.sps.socket') selection.plugs.mode = 'off';
        assert.deepEqual(zone.output.getSources(selection), []);
        selection.filter.exclude = ['Test'];
        assert.deepEqual(zone.output.getSources(selection), []);
    });
}

for (const type of ['Pen', 'Orf', 'Plug', 'Socket', 'Touch']) {
    test(`${type} every source is controlled by its corresponding link option`, () => {
        const zone = device(type);
        const selection = link(type === 'Touch' ? 'vrchat.sps.touch'
            : zone.output.type === 'plug' ? 'vrchat.sps.plug' : 'vrchat.sps.socket');
        const allSources = zone.output.getSources(selection);
        const groups = selection.kind === 'vrchat.sps.touch' ? ['hands'] as const : ['hands', 'plugs', 'sockets'] as const;
        for (const group of groups) {
            const interaction = group === 'hands' ? selection.hands : 'plugs' in selection ? selection[group] : undefined;
            if (!interaction) throw new Error('Missing interaction');
            const matching = group !== 'hands' && selection.kind === `vrchat.sps.${group === 'plugs' ? 'plug' : 'socket'}`;
            const keys = group === 'hands' ? ['touchSelf', 'touchOthers']
                : matching ? ['frotOthers'] : ['depthSelf', 'depthOthers'];
            const disabled = {...selection, [group]: {...interaction, mode: 'off'}};
            assert.equal(zone.output.getSources(disabled).length, allSources.length - keys.length);
            for (const [party, key] of [['self', keys[0]], ['others', keys[1]]] as const) {
                const withoutParty = {...selection, [group]: {...interaction, [party]: false}};
                const sources = zone.output.getSources(withoutParty);
                if (matching) assert.deepEqual(sources, allSources, 'Matching types ignore party flags');
                else {
                    assert.equal(sources.length, allSources.length - 1);
                    assert.ok(sources.every(source => !source.id.endsWith('/' + key)));
                }
            }
        }
        selection.filter.include = ['Other'];
        assert.deepEqual(zone.output.getSources(selection), []);
        selection.filter.include = [' Test '];
        assert.equal(zone.output.getSources(selection).length, allSources.length);
        selection.filter.exclude = [' Test '];
        assert.deepEqual(zone.output.getSources(selection), []);
    });
}

for (const type of ['Plug', 'Socket', 'Pen', 'Orf', 'Touch']) {
    for (const velocity of [false, true]) {
        test(`linear outputs ignore ${type} touch and frot (${velocity ? 'velocity' : 'proximity'}) but retain penetration`, () => {
            const initial: Record<string, unknown> = {};
            for (const contact of ['TouchSelf', 'TouchOthers', 'FrotOthers', 'Self', 'Others']) {
                initial[contact] = 1;
                initial[contact + 'Close'] = true;
                if (velocity) initial[contact + '_SenderVelocityMagnitude'] = 1;
            }
            const zone = device(type, initial);
            const selection = link(type === 'Touch' ? 'vrchat.sps.touch'
                : zone.output.type === 'plug' ? 'vrchat.sps.plug' : 'vrchat.sps.socket');
            const config: OutputConfig = {plugin: 'intiface', id: 'Test', links: [selection]};
            const linear = new OutputController({
        type: 'linear',
        lastLevel: 0,
        setLevel() {},
    } satisfies OutputEndpoint);
            const read = () => linkResults(linear, [zone.output], config)[0]!.output;
            assert.equal(read(), 0);
            assert.equal(linkResults(outputFor(), [zone.output], config)[0]!.output, 1);
            if (type === 'Touch') return;
            zone.set('PenOthers', 0.4);
            zone.set('LengthMult1', 1);
            zone.set('LengthMult2', 1);
            zone.set('DepthOthers', 1);
            zone.set('DepthOthers_PointSeparation', 0.6);
            zone.set('DepthOthers_SenderLossyScaleZ', 1);
            zone.set('DepthOthers_CollisionTag_SPS/Plug/test', 1);
            near(read(), 0.4);
        });
    }
}

test('movement velocity sources preserve scale and dead zone', () => {
    const plug = device('Plug', {TouchOthers: 1, TouchOthers_SenderVelocityMagnitude: 0.4});
    const selection = link('vrchat.sps.plug', true);
    selection.mutators = [{kind: 'deadZone', level: 0.2}, {kind: 'scale', scale: 2}];
    const config: OutputConfig = {plugin: 'intiface', id: 'Test', links: [selection]};
    const output = outputFor();
    for (let i = 0; i < 4; i++) near(linkResults(output, [plug.output], config)[0]!.output, 0.5);
    plug.set('TouchOthers_SenderVelocityMagnitude', 0);
    assert.equal(linkResults(output, [plug.output], config)[0]!.output, 0);
});

test('movement mode differentiates penetration without a link-wide motion modifier', () => {
    const plug = device('Plug', {LengthMult1: 0.01, LengthMult2: 40, DepthOthers: 1, DepthOthers_PointSeparation: 0.2});
    const selection = link('vrchat.sps.plug');
    if (selection.kind !== 'vrchat.sps.plug') throw new Error('Expected plug link');
    selection.sockets.mode = 'movement';
    const config: OutputConfig = {plugin: 'intiface', id: 'Test', links: [selection]};
    const output = outputFor();
    near(linkResults(output, [plug.output], config)[0]!.output, 0);
    plug.set('DepthOthers_PointSeparation', 0.1);
    near(linkResults(output, [plug.output], config)[0]!.output, 0.5);
});

for (const type of ['Plug', 'Socket']) {
    for (const self of [false, true]) {
        test(`${type} ${self ? 'self' : 'others'} depth Movement uses native velocity, not depth changes`, () => {
            const contact = self ? 'DepthSelf' : 'DepthOthers';
            const zone = device(type, {
                LengthMult1: 1,
                LengthMult2: 0.4,
                [contact]: 1,
                [contact + '_PointSeparation']: 0.3,
                [contact + '_SenderLossyScaleZ']: 0.4,
                [contact + '_CollisionTag_SPS/Plug/test']: true,
                [contact + '_SenderVelocityMagnitude']: 0.6,
            });
            const selection = link(`vrchat.sps.${zone.output.type}`);
            if (selection.kind === 'vrchat.sps.touch') throw new Error('Expected depth link');
            const interaction = createInteraction(self, !self, 'movement');
            selection.hands.mode = 'off';
            if (selection.kind === 'vrchat.sps.plug') {
                selection.sockets = interaction;
                selection.plugs.mode = 'off';
            } else {
                selection.plugs = interaction;
                selection.sockets.mode = 'off';
            }
            const config: OutputConfig = {plugin: 'intiface', id: 'Test', links: [selection]};
            const output = outputFor();
            const read = () => linkResults(output, [zone.output], config)[0]!.output;
            near(read(), 0.6);
            near(read(), 0.6);
            const linear = new OutputController({type: 'linear', lastLevel: 0, setLevel() {}});
            near(linkResults(linear, [zone.output], config)[0]!.output, 0.25);
            interaction.mode = 'proximity';
            near(read(), 0.25);
            interaction.mode = 'movement';
            for (const velocity of [0, undefined, -1, NaN, Infinity]) {
                zone.set(contact + '_SenderVelocityMagnitude', velocity);
                zone.set(contact + '_PointSeparation', 0.1);
                near(read(), 0);
                assert.equal(zone.output.getSources(selection)[0]!.kind, 'speed');
            }
            zone.set(contact + '_SenderVelocityMagnitude', 0.8);
            zone.set(contact, 0);
            near(read(), 0);
            zone.set(contact, 1);
            near(read(), 0.8);
            interaction.mode = 'off';
            near(read(), 0);
        });
    }
}

for (const type of ['Pen', 'Orf', 'Plug', 'Socket', 'Touch']) {
    test(`${type} movement falls back to proximity derivatives and mode changes do not spike`, () => {
        const contact = type === 'Touch' ? 'Others' : 'TouchOthers';
        const zone = device(type, {[contact]: 0.4, [contact + 'Close']: true});
        const selection = link(`vrchat.sps.${zone.output.type}`, true);
        const config: OutputConfig = {plugin: 'intiface', id: 'Test', links: [selection]};
        const output = outputFor();
        const read = () => linkResults(output, [zone.output], config)[0]!.output;
        near(read(), 0);
        zone.set(contact, 0.65);
        near(read(), 0.5);
        near(read(), 0);
        selection.hands.mode = 'proximity';
        near(read(), 0.65);
        near(read(), 0.65);
        selection.hands.mode = 'off';
        near(read(), 0);
        selection.hands.mode = 'movement';
        near(read(), 0);
    });
}

test('movement hands and proximity penetration coexist on a single link', () => {
    const zone = device('Pen', {
        TouchOthers: 0.9,
        TouchOthersClose: true,
        TouchOthers_SenderVelocityMagnitude: 0.4,
        PenOthers: 0.6,
    });
    const selection = link('vrchat.sps.plug', true);
    if (selection.kind !== 'vrchat.sps.plug') throw new Error('Expected plug link');
    const config: OutputConfig = {plugin: 'intiface', id: 'Test', links: [selection]};
    const output = outputFor();
    near(linkResults(output, [zone.output], config)[0]!.output, 0.6);
    selection.sockets.mode = 'movement';
    near(linkResults(output, [zone.output], config)[0]!.output, 0.4);
    selection.hands.mode = 'proximity';
    near(linkResults(output, [zone.output], config)[0]!.output, 0.9);
});

class Connection extends TypedEventEmitter<{add: (key: string, value: OscValue) => void; clear: () => void}> {
    private readonly values = new Map<string, Value>();
    start() {}
    entries() { return this.values; }
    set(key: string, value: unknown) {
        const existing = this.values.get(key);
        if (existing) existing.set(value);
        else {
            const entry = new Value(value);
            this.values.set(key, entry);
            this.emit('add', key, entry as unknown as OscValue);
        }
    }
    clear() { this.values.clear(); this.emit('clear'); }
}

for (const [type, contact, key] of [
    ['Plug', 'TouchOthers', 'touchOthers'],
    ['Socket', 'FrotOthers', 'frotOthers'],
    ['Touch', 'Others', 'touchOthers'],
    ['Plug', 'DepthOthers', 'depthOthers'],
    ['Socket', 'DepthSelf', 'depthSelf'],
] as const) {
    test(`${type}/${contact} native velocity is normalized to 1.5 m eye height`, () => {
        const zone = device(type, {
            [contact]: 1,
            [contact + '_SenderVelocityMagnitude']: 0.4,
            [contact + '_PointSeparation']: 0.2,
            [contact + '_SenderLossyScaleZ']: 0.4,
            [contact + '_CollisionTag_SPS/Plug/test']: true,
            LengthMult1: 1,
            LengthMult2: 0.4,
        });
        const selection = link(`vrchat.sps.${zone.output.type}`, true);
        if (selection.kind === 'vrchat.sps.plug') selection.sockets.mode = 'movement';
        if (selection.kind === 'vrchat.sps.socket') selection.plugs.mode = 'movement';
        const read = (height: unknown) => resolveVrchatLink(
            selection,
            0,
            false,
            [zone.output],
            new Map([['EyeHeightAsMeters', height]]),
        )!.find(source => source.id.endsWith('/' + key))!;
        for (const [height, expected] of [[0.75, 0.8], [1.5, 0.4], [3, 0.2]] as const) {
            const sample = read(height);
            assert.equal(sample.kind, 'speed');
            near(sample.value, expected);
        }
        for (const invalid of [undefined, 0, -1, NaN, Infinity, '3']) near(read(invalid).value, 0.4);
        selection.hands.mode = 'proximity';
        if (selection.kind !== 'vrchat.sps.touch') selection.plugs.mode = selection.sockets.mode = 'proximity';
        const expectedPosition = contact.startsWith('Depth') ? 0.5 : 1;
        near(read(0.75).value, expectedPosition);
        near(read(3).value, expectedPosition);
    });
}

test('eye-height updates are live, snapshot-consistent, and reset on avatar change', async t => {
    const osc = new Connection();
    const adapter = await createPlugin(osc, t);
    const selection = link('vrchat.sps.touch', true);
    const read = (snapshot = adapter.snapshot()) => snapshot(selection, 0, false)!.inputs[1]!.value;
    osc.set('OGB/Touch/Test/Others', 1);
    osc.set('OGB/Touch/Test/Others_SenderVelocityMagnitude', 0.4);
    near(read(), 0.4);
    osc.set('EyeHeightAsMeters', 1.5);
    const snapshot = adapter.snapshot();
    osc.set('EyeHeightAsMeters', 3);
    near(read(), 0.2);
    near(read(snapshot), 0.4);
    osc.clear();
    osc.set('OGB/Touch/Test/Others', 1);
    osc.set('OGB/Touch/Test/Others_SenderVelocityMagnitude', 0.4);
    near(read(), 0.4);
});

test('VRChat adapter snapshots arbitrary parameters independently of subsequent OSC changes', async t => {
    const osc = new Connection();
    const adapter = await createPlugin(osc, t);
    osc.set('custom', 0.4);
    const parameter: OutputLink = {plugin: 'vrchat', kind: 'vrchat.avatarParameter', parameter: ' custom ', mutators: []};
    const snapshot = adapter.snapshot();
    osc.set('custom', true);
    assert.equal(snapshot(parameter, 0, false)?.inputs[0]?.value, 0.4);
    assert.equal(adapter.snapshot()(parameter, 0, false)?.inputs[0]?.value, 1);
    osc.clear();
    assert.equal(adapter.snapshot()(parameter, 0, false)?.inputs[0]?.value, 0);
    assert.equal(snapshot({plugin: 'constant', kind: 'constant', level: 1}, 0, false), undefined);
});

test('VRChat startup is explicit and shutdown detaches discovery, contact listeners and IPC', async () => {
    const osc = new Connection();
    osc.set('OGB/Plug/Test/TouchOthers', 0.5);
    const value = osc.entries().get('OGB/Plug/Test/TouchOthers')!;
    const plugin = new VrchatPlugin(
        osc as unknown as OscConnection,
        {start() {}} as unknown as ConstructorParameters<typeof VrchatPlugin>[1],
        {async start() {}} as unknown as ConstructorParameters<typeof VrchatPlugin>[2],
        {start() {}} as unknown as ConstructorParameters<typeof VrchatPlugin>[3],
    );
    assert.equal(osc.listenerCount('add'), 0);
    assert.deepEqual(plugin.getAvatarZones(), []);
    const {host, handlers, invoke} = createPluginHost();
    const runtime = new PluginRuntime([plugin], host);
    await runtime.start();
    assert.equal(plugin.getAvatarZones().length, 1);
    assert.equal(value.listenerCount('change'), 1);
    assert.equal(invoke('avatarParams:get').get('OGB/Plug/Test/TouchOthers'), 0.5);
    osc.clear();
    assert.equal(value.listenerCount('change'), 0);
    osc.set('OGB/Plug/Test/TouchOthers', 0.7);
    const replacement = osc.entries().get('OGB/Plug/Test/TouchOthers')!;
    assert.equal(replacement.listenerCount('change'), 1);
    runtime.stop();
    assert.equal(handlers.size, 0);
    assert.equal(osc.listenerCount('add'), 0);
    assert.equal(osc.listenerCount('clear'), 0);
    assert.equal(replacement.listenerCount('change'), 0);
});

test('VRChat plugin reports combined level only to the configured avatar parameter', async t => {
    const sent: [string, number][] = [];
    let clears = 0;
    const osc = Object.assign(new Connection(), {
        clearDeltas: () => { clears++; },
        send: (parameter: string, value: number) => { sent.push([parameter, value]); },
    });
    const config = getDefaultConfig();
    const plugin = await createPlugin(osc, t, () => config);
    plugin.afterUpdate(0.4);
    assert.deepEqual(sent, []);
    config.plugins['vrchat']!['maxLevelParam'] = 'AvatarLevel';
    plugin.afterUpdate(0.6);
    assert.deepEqual(sent, [['AvatarLevel', 0.6]]);
    assert.equal(clears, 2);
});

test('VRChat adapter discovers existing values and restores TPS fallback after avatar clear', async t => {
    const osc = new Connection();
    osc.set('TPS_Internal/Pen/Shared/RootRoot', 0.5);
    const adapter = await createPlugin(osc, t);
    assert.equal(adapter.getAvatarZones().length, 1);
    assert.equal(adapter.getAvatarZones()[0]!.isTps, true);
    osc.set('OGB/Pen/Shared/PenOthers', 0.3);
    assert.equal(adapter.getAvatarZones().length, 1);
    assert.equal(adapter.getAvatarZones()[0]!.isTps, false);
    osc.clear();
    assert.deepEqual(adapter.getAvatarZones(), []);
    osc.set('TPS_Internal/Orf/Shared/Depth_In', 0.7);
    assert.equal(adapter.getAvatarZones().length, 1);
    const zone = adapter.getAvatarZones()[0]!;
    assert.equal(zone.isTps, true);
    near(zone.getSources(link('vrchat.sps.socket'))[0]!.value, 0.7);
});

test('VRChat adapter reads boolean and numeric haptics-disabled metadata without creating zones', async t => {
    const osc = new Connection();
    const adapter = await createPlugin(osc, t);
    for (const [raw, expected] of [[true, true], [1, true], [false, false], [0, false], ['1', false]] as const) {
        osc.set('OGB/HapticsDisabled', raw);
        assert.equal(adapter.hasHapticsDisabled(), expected);
        assert.deepEqual(adapter.getAvatarZones(), []);
    }
    osc.clear();
    assert.equal(adapter.hasHapticsDisabled(), false);
});

test('VRChat adapter accepts both namespace generations, preserves slash-containing tags, and ignores metadata as devices', async t => {
    const osc = new Connection();
    const bridge = await createPlugin(osc, t);
    osc.set('TPS_Internal/Pen/Tps/RootRoot', 0.5);
    assert.equal(bridge.getAvatarZones().length, 1);
    osc.set('OGB/Version/11', true);
    osc.set('OGB/HapticsDisabled', false);
    assert.equal(bridge.getAvatarZones().length, 1, 'metadata must not suppress TPS devices');
    osc.set('OGB/Plug/Modern/DepthOthers', 1);
    osc.set('OGB/Socket/Native/DepthOthers', 1);
    osc.set('OGB/Socket/Native/DepthOthers_PointSeparation', 0.1);
    osc.set('OGB/Socket/Native/DepthOthers_SenderLossyScaleZ', 0.4);
    osc.set('OGB/Socket/Native/DepthOthers_CollisionTag_SPS/Plug/custom', 1);
    osc.set('OGB/Pen/Old/PenOthers', 0.5);
    osc.set('OGB/Orf/OldSocket/PenOthers', 0.5);
    osc.set('OGB/Touch/ModernTouch/Others', 0.5);
    osc.set('VFH/Zone/Touch/OldTouch/Others', 0.5);
    const devices = bridge.getAvatarZones();
    assert.deepEqual(devices.map(d => [d.type, d.id]), [
        ['plug', 'Modern'], ['socket', 'Native'], ['plug', 'Old'], ['socket', 'OldSocket'], ['touch', 'ModernTouch'], ['touch', 'OldTouch'],
    ]);
    near(devices.find(d => d.id === 'Native')!.getSources(link('vrchat.sps.socket')).find(s => s.id.endsWith('/depthOthers'))!.value, 0.75);
    osc.set('OGB/HapticsDisabled', true);
    assert.equal(bridge.hasHapticsDisabled(), true);
    assert.deepEqual(bridge.getAvatarZones(), devices);
    osc.set('OGB/HapticsDisabled', false);
    assert.equal(bridge.getAvatarZones().length, 6);
    osc.clear();
    assert.deepEqual(bridge.getAvatarZones(), []);
});

for (const format of [
    {prefix: 'TPS_Internal/Pen', fields: {RootRoot: 0.4}, plugin: 'vrchat', kind: 'vrchat.sps.plug'},
    {prefix: 'TPS_Internal/Orf', fields: {Depth_In: 0.4}, plugin: 'vrchat', kind: 'vrchat.sps.socket'},
    {prefix: 'OGB/Pen', fields: {PenOthers: 0.4}, plugin: 'vrchat', kind: 'vrchat.sps.plug'},
    {prefix: 'OGB/Orf', fields: {PenOthers: 0.4, PenOthersClose: true}, plugin: 'vrchat', kind: 'vrchat.sps.socket'},
    {prefix: 'OGB/Plug', fields: {DepthOthers: 1, DepthOthers_PointSeparation: 0.6,
        LengthMult1: 0.01, LengthMult2: 100}, plugin: 'vrchat', kind: 'vrchat.sps.plug'},
    {prefix: 'OGB/Socket', fields: {DepthOthers: 1, DepthOthers_PointSeparation: 0.6,
        DepthOthers_SenderLossyScaleZ: 1, 'DepthOthers_CollisionTag_SPS/Plug/channel/with/slashes': true}, plugin: 'vrchat', kind: 'vrchat.sps.socket'},
    {prefix: 'OGB/Touch', fields: {Others: 0.4}, plugin: 'vrchat', kind: 'vrchat.sps.touch'},
    {prefix: 'VFH/Zone/Touch', fields: {Others: 0.4}, plugin: 'vrchat', kind: 'vrchat.sps.touch'},
    {prefix: 'OGB/Touch', fields: {Others: 1, Others_SenderVelocityMagnitude: 0.4}, plugin: 'vrchat', kind: 'vrchat.sps.touch'},
] satisfies {plugin: string; prefix: string; fields: Record<string, unknown>; kind: SpsLink['kind']}[]) {
    test(`${format.prefix} OSC ingress through routing, updates, and avatar clear`, async t => {
        const osc = new Connection();
        const bridge = await createPlugin(osc, t);
        for (const [key, value] of Object.entries(format.fields)) osc.set(`${format.prefix}/Test/${key}`, value);
        const selection = link(format.kind, Object.keys(format.fields).some(key => key.endsWith('_SenderVelocityMagnitude')));
        const config: OutputConfig = {plugin: 'intiface', id: 'Test', links: [selection]};
        const output = outputFor();
        const read = () => output.getLinkOutputs(
            collectLinkInputs(config.links, false, new Map([['vrchat', bridge.snapshot()]])), 100)[0]!.output;
        near(read(), 0.4);
        // Modify an existing OSC entry, rather than merely constructing initial samples.
        const [firstKey, firstValue] = Object.entries(format.fields)[0]!;
        osc.set(`${format.prefix}/Test/${firstKey}`, 0);
        near(read(), 0);
        osc.set(`${format.prefix}/Test/${firstKey}`, firstValue);
        near(read(), 0.4);
        osc.clear();
        near(read(), 0);
        assert.deepEqual(bridge.getAvatarZones(), []);
    });
}
