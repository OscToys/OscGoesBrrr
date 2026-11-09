import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import GameDevice from './GameDevice';
import Bridge, {BridgeOutput} from './bridge';
import type OscConnection from './OscConnection';
import type {OscValue} from './OscConnection';
import type Intiface from './Intiface';
import type {DeviceFeature} from './Intiface';
import type ConfigService from './services/ConfigService';
import TypedEventEmitter from '../common/TypedEventEmitter';
import {getDefaultLinks, type Output, type OutputLink} from '../common/configTypes';

type SpsLink = Extract<OutputLink, {kind: 'vrchat.sps.plug' | 'vrchat.sps.socket' | 'vrchat.sps.touch'}>;

class Value extends TypedEventEmitter<{change: (oldValue: unknown, newValue: unknown) => void}> {
    constructor(private value: unknown) { super(); }
    get() { return this.value; }
    set(next: unknown) {
        const previous = this.value;
        this.value = next;
        this.emit('change', previous, next);
    }
}

function link(kind: SpsLink['kind']): SpsLink {
    const result = getDefaultLinks().find((item): item is SpsLink => item.kind === kind)!;
    result.ownHands = result.otherHands = true;
    if (result.kind === 'vrchat.sps.plug') result.mySockets = result.otherSockets = result.otherPlugs = true;
    if (result.kind === 'vrchat.sps.socket') result.myPlugs = result.otherPlugs = result.otherSockets = true;
    return result;
}

function device(type: string, initial: Record<string, unknown> = {}, isTps = false) {
    const output = new GameDevice(type, 'Test', isTps);
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
        const kind = output.type === 'Pen' ? 'vrchat.sps.plug' : output.type === 'Orf' ? 'vrchat.sps.socket' : 'vrchat.sps.touch';
        return output.getSources(link(kind)).find(item => item.id.endsWith('/' + key))!;
    };
    return {output, set, source};
}

function near(actual: number, expected: number) {
    assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`);
}

for (const self of [true, false]) {
    const contact = self ? 'DepthSelf' : 'DepthOthers';
    const source = self ? 'penSelf' : 'penOthers';
    test(`SPS3 plug ${contact} reconstructs live length from both multipliers`, () => {
        const plug = device('Plug', {LengthMult1: 0.01, LengthMult2: 40, [contact]: 1, [contact + '_PointSeparation']: 0.1});
        assert.equal(plug.output.type, 'Pen');
        near(plug.source(source).level, 0.75);
        plug.set('LengthMult1', 0.02);
        near(plug.source(source).level, 0.875);
        plug.set(contact + '_PointSeparation', 0);
        near(plug.source(source).level, 1);
        plug.set(contact + '_PointSeparation', 1);
        near(plug.source(source).level, 0);
        plug.set(contact + '_PointSeparation', -1);
        near(plug.source(source).level, 0);
    });

    test(`SPS3 socket ${contact} uses native tags and sender length at saturation`, () => {
        const socket = device('Socket', {
            [contact]: 1, [contact + '_PointSeparation']: 0.1, [contact + '_SenderLossyScaleZ']: 0.4,
            [contact + '_CollisionTag_SPS/Plug/_public']: true,
        });
        assert.equal(socket.output.type, 'Orf');
        near(socket.source(source).level, 0.75);
        socket.set(contact + '_SenderLossyScaleZ', 0.8);
        near(socket.source(source).level, 0.875);
        socket.set(contact, 0);
        near(socket.source(source).level, 0);
        socket.set(contact, 1);
        socket.set(contact + '_PointSeparation', -1);
        near(socket.source(source).level, 0);
    });
}

for (const invalid of [0, -1, undefined, NaN, Infinity]) {
    test(`invalid plug length ${String(invalid)} does not produce haptics`, () => {
        const plug = device('Plug', {LengthMult1: invalid, LengthMult2: 40, DepthOthers: 1, DepthOthers_PointSeparation: 0});
        assert.equal(plug.source('penOthers').level, 0);
    });
}

test('legacy plug on an SPS3 socket uses advertised receiver radius and caches length through penetration', () => {
    const socket = device('Socket', {DepthRadius: 0.2, DepthOthers: 0.5, DepthOthers_PointSeparation: 0.5,
        DepthOthers_SenderLossyScaleZ: 99});
    near(socket.source('penOthers').level, 0);
    socket.set('DepthOthers', 1);
    socket.set('DepthOthers_PointSeparation', 0.2);
    near(socket.source('penOthers').level, 0.5);
    socket.set('DepthOthers_PointSeparation', 0.1);
    near(socket.source('penOthers').level, 0.75);
    socket.set('DepthOthers', 0);
    socket.set('DepthOthers_PointSeparation', -1);
    socket.set('DepthOthers_PointSeparation', 0.3);
    socket.set('DepthOthers', 1);
    near(socket.source('penOthers').level, 0);
    socket.set('DepthOthers_PointSeparation', 0.15);
    near(socket.source('penOthers').level, 0.5);
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
        near(socket.source('penOthers').level, 0.5);
    });
}

test('legacy length estimates support plugs larger than the receiver and never interpret scale without native tags', () => {
    const socket = device('Socket', {DepthRadius: 0.1, DepthOthers: 0.5, DepthOthers_PointSeparation: 1.25,
        DepthOthers_SenderLossyScaleZ: 5000});
    socket.set('DepthOthers', 1);
    socket.set('DepthOthers_PointSeparation', 0.6);
    near(socket.source('penOthers').level, 0.5);
    socket.set('DepthOthers_CollisionTag_SPS/Plug/private', 1);
    socket.set('DepthOthers_SenderLossyScaleZ', 0.8);
    near(socket.source('penOthers').level, 0.25);
    socket.set('DepthOthers_CollisionTag_SPS/Plug/private', 0);
    near(socket.source('penOthers').level, 0);
});

for (const [type, contact, source] of [
    ['Plug', 'TouchSelf', 'touchSelf'], ['Plug', 'TouchOthers', 'touchOthers'], ['Plug', 'FrotOthers', 'frotOthers'],
    ['Socket', 'TouchSelf', 'touchSelf'], ['Socket', 'TouchOthers', 'touchOthers'],
    ['Touch', 'Self', 'touchSelf'], ['Touch', 'Others', 'touchOthers'],
    ['Pen', 'FrotOthers', 'frotOthers'], ['Orf', 'TouchOthers', 'touchOthers'],
] as const) {
    test(`${type}/${contact} uses magnitude exclusively when present, including zero and missing contact`, () => {
        const zone = device(type, {[contact]: 0.9, [contact + '_SenderVelocityMagnitude']: 0.4});
        near(zone.source(source).level, 0.4);
        assert.equal(zone.source(source).disableMotionBased, true);
        for (const speed of [0, undefined, -1, NaN, Infinity]) {
            zone.set(contact + '_SenderVelocityMagnitude', speed);
            assert.equal(zone.source(source).level, 0);
            assert.equal(zone.source(source).disableMotionBased, true);
        }
        zone.set(contact + '_SenderVelocityMagnitude', 8);
        zone.set(contact, 0);
        assert.equal(zone.source(source).level, 0);
    });
}

test('old Pen/Orf/Touch outputs retain proximity, close gating and penetration behavior', () => {
    const pen = device('Pen', {TouchSelf: 0.8, TouchOthers: 0.7, PenSelf: 0.6, PenOthers: 0.5, FrotOthers: 0.4});
    assert.equal(pen.source('touchSelf').level, 0);
    assert.equal(pen.source('frotOthers').level, 0);
    pen.set('TouchSelfClose', true);
    pen.set('FrotOthersClose', true);
    near(pen.source('touchSelf').level, 0.8);
    near(pen.source('frotOthers').level, 0.4);
    near(pen.source('penSelf').level, 0.6);
    near(pen.source('penOthers').level, 0.5);
    assert.notEqual(pen.source('touchSelf').disableMotionBased, true);
    const socket = device('Orf', {PenSelf: 0.6, PenOthers: 0.5, FrotOthers: 0.4});
    near(socket.source('penSelf').level, 0.6);
    near(socket.source('penOthers').level, 0.5);
    near(socket.source('frotOthers').level, 0.4);
    socket.set('PenOthersClose', false);
    near(socket.source('penOthers').level, 0);
    const touch = device('Touch', {Self: 0.2, Others: 0.3});
    near(touch.source('touchSelf').level, 0.2);
    near(touch.source('touchOthers').level, 0.3);
});

test('old socket root/tip measurements still override old penetration outputs', () => {
    const socket = device('Orf', {PenOthers: 0.9, PenOthersNewRoot: 0.5, PenOthersNewTip: 0.9});
    for (let i = 0; i < 6; i++) {
        socket.set('PenOthersNewRoot', 0.5);
        socket.set('PenOthersNewTip', 0.9);
    }
    socket.set('PenOthersNewRoot', 0.7);
    socket.set('PenOthersNewTip', 1);
    near(socket.source('penOthers').level, 0.25);
});

test('new contacts without magnitude can still use proximity and existing ID filters', () => {
    const plug = device('Plug', {TouchOthers: 0.6, FrotOthers: 0.4});
    near(plug.source('touchOthers').level, 0.6);
    near(plug.source('frotOthers').level, 0.4);
    const selection = link('vrchat.sps.plug');
    selection.filter.include = ['Different'];
    assert.deepEqual(plug.output.getSources(selection), []);
    selection.filter.include = [' Test '];
    assert.ok(plug.output.getSources(selection).length > 0);
    selection.filter.exclude = ['Test'];
    assert.deepEqual(plug.output.getSources(selection), []);
});

function outputFor() {
    return new BridgeOutput({id: 'Test', type: 'vibrate'} as DeviceFeature, {} as ConfigService,
        {entries: () => new Map()} as unknown as OscConnection);
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
                : zone.output.type === 'Pen' ? 'vrchat.sps.plug' : 'vrchat.sps.socket');
            const config: Output = {id: 'Test', links: [selection]};
            const linear = new BridgeOutput({id: 'Test', type: 'linear'} as DeviceFeature, {} as ConfigService,
                {entries: () => new Map()} as unknown as OscConnection);
            const read = () => linear.getLinkOutputs([zone.output], undefined, config, 100)[0]!.output;
            assert.equal(read(), 0);
            assert.equal(outputFor().getLinkOutputs([zone.output], undefined, config, 100)[0]!.output, 1);
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

test('velocity-based sources bypass only motion mutation while preserving scale and dead zone', () => {
    const plug = device('Plug', {TouchOthers: 1, TouchOthers_SenderVelocityMagnitude: 0.4});
    const selection = link('vrchat.sps.plug');
    selection.mutators = [{kind: 'motionBased'}, {kind: 'deadZone', level: 0.2}, {kind: 'scale', scale: 2}];
    const config: Output = {id: 'Test', links: [selection]};
    const output = outputFor();
    for (let i = 0; i < 4; i++) near(output.getLinkOutputs([plug.output], undefined, config, 100)[0]!.output, 0.5);
    plug.set('TouchOthers_SenderVelocityMagnitude', 0);
    assert.equal(output.getLinkOutputs([plug.output], undefined, config, 100)[0]!.output, 0);
});

test('motion mutation still differentiates penetration on the same new-format link', () => {
    const plug = device('Plug', {LengthMult1: 0.01, LengthMult2: 40, DepthOthers: 1, DepthOthers_PointSeparation: 0.2});
    const selection = link('vrchat.sps.plug');
    selection.mutators = [{kind: 'motionBased'}];
    const config: Output = {id: 'Test', links: [selection]};
    const output = outputFor();
    near(output.getLinkOutputs([plug.output], undefined, config, 100)[0]!.output, 0);
    plug.set('DepthOthers_PointSeparation', 0.1);
    near(output.getLinkOutputs([plug.output], undefined, config, 100)[0]!.output, 0.5);
});

class Connection extends TypedEventEmitter<{add: (key: string, value: OscValue) => void; clear: () => void}> {
    private readonly values = new Map<string, Value>();
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

test('bridge accepts both namespace generations, preserves slash-containing tags, and ignores metadata as devices', t => {
    t.mock.timers.enable({apis: ['setInterval']});
    const osc = new Connection();
    const intiface = new TypedEventEmitter<{addFeature: (feature: DeviceFeature) => void; removeFeature: (feature: DeviceFeature) => void}>();
    const bridge = new Bridge(osc as unknown as OscConnection, intiface as Intiface, {} as ConfigService);
    osc.set('TPS_Internal/Pen/Tps/RootRoot', 0.5);
    assert.equal(bridge.getGameDevices().length, 1);
    osc.set('OGB/Version/11', true);
    osc.set('OGB/HapticsDisabled', false);
    assert.equal(bridge.getGameDevices().length, 1, 'metadata must not suppress TPS devices');
    osc.set('OGB/Plug/Modern/DepthOthers', 1);
    osc.set('OGB/Socket/Native/DepthOthers', 1);
    osc.set('OGB/Socket/Native/DepthOthers_PointSeparation', 0.1);
    osc.set('OGB/Socket/Native/DepthOthers_SenderLossyScaleZ', 0.4);
    osc.set('OGB/Socket/Native/DepthOthers_CollisionTag_SPS/Plug/custom', 1);
    osc.set('OGB/Pen/Old/PenOthers', 0.5);
    osc.set('OGB/Orf/OldSocket/PenOthers', 0.5);
    osc.set('OGB/Touch/ModernTouch/Others', 0.5);
    osc.set('VFH/Zone/Touch/OldTouch/Others', 0.5);
    const devices = bridge.getGameDevices();
    assert.deepEqual(devices.map(d => [d.type, d.id]), [
        ['Pen', 'Modern'], ['Orf', 'Native'], ['Pen', 'Old'], ['Orf', 'OldSocket'], ['Touch', 'ModernTouch'], ['Touch', 'OldTouch'],
    ]);
    near(devices.find(d => d.id === 'Native')!.getSources(link('vrchat.sps.socket')).find(s => s.id.endsWith('/penOthers'))!.level, 0.75);
    osc.set('OGB/HapticsDisabled', true);
    assert.equal(bridge.hasHapticsDisabled(), true);
    assert.deepEqual(bridge.getGameDevices(), devices);
    osc.set('OGB/HapticsDisabled', false);
    assert.equal(bridge.getGameDevices().length, 6);
    osc.clear();
    assert.deepEqual(bridge.getGameDevices(), []);
});
