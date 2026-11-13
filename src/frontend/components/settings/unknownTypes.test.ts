/// <reference types="node" />
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createTheme} from '@mui/material/styles';
import {atom, createStore, Provider} from 'jotai';
import type {OutputConfig, OutputLink} from '../../../common/application/configTypes';
import type {OutputDeviceInfo, SettingsStatePayload} from '../../../common/application/ipcContract';
import type * as Configuration from '../../../common/application/configuration';
import {outputKey} from '../../../common/application/outputIdentity';

test('unknown link and output rows retain their settings and show fallback editors', async t => {
    const server = await createServer({
        configFile: false,
        appType: 'custom',
        server: {middlewareMode: true, hmr: false},
        optimizeDeps: {noDiscovery: true},
    });
    t.after(() => server.close());
    const {default: LinkEditor} = await server.ssrLoadModule('/src/frontend/components/settings/OutputLinkEditor.tsx');
    const {default: OutputEditor} = await server.ssrLoadModule('/src/frontend/components/settings/ConfiguredOutputRow.tsx');
    const {default: UnconfiguredOutputRow} = await server.ssrLoadModule('/src/frontend/components/settings/UnconfiguredOutputRow.tsx');
    const {getDefaultConfig} = await server.ssrLoadModule('/src/common/application/configuration.ts') as typeof Configuration;
    const {SettingsStateAtomProvider} = await server.ssrLoadModule('/src/frontend/components/settings/SettingsStateAtomContext.tsx');
    const link: OutputLink = {
        plugin: 'future',
        kind: 'future.link',
        enabled: false,
        options: {nested: ['preserve', 42]},
        mutators: {private: ['opaque', 42]},
    };
    const store = createStore();
    const linkAtom = atom(link);
    const renderLink = () => renderToStaticMarkup(createElement(
        Provider,
        {store},
        createElement(LinkEditor, {linkAtom, activeLevel: 0, removeLink() {}}),
    ));
    const markup = renderLink();
    assert.match(markup, /Unknown future:future.link/);
    assert.match(markup, /<span[^>]*MuiTypography-caption[^>]*>Plugin Unavailable<\/span>/);
    assert.match(markup, /no plugin handles it/);
    assert.match(markup, /Enable link/);
    assert.match(markup, /Remove link/);
    assert.deepEqual(store.get(linkAtom), link);
    store.set(linkAtom, {...link, enabled: true});
    assert.match(renderLink(), /Unknown future:future.link/);
    assert.deepEqual(store.get(linkAtom)['options'], link['options']);
    store.set(linkAtom, {...link, kind: 'constant', level: 'belongs to future, not constant'});
    assert.match(renderLink(), /Unknown future:constant/);
    const registry = await server.ssrLoadModule('/src/frontend/plugins/plugins.ts');
    registry['pluginsById'].set('future', {
        id: 'future',
        name: 'Future Plugin',
        links: [{
            plugin: 'future',
            kind: 'constant',
            label: 'Future-owned Constant',
            order: 0,
            create: () => ({plugin: 'future', kind: 'constant'}),
            summary: () => 'Handled by its own plugin',
        }],
    });
    assert.match(renderLink(), /Future-owned Constant/);
    assert.doesNotMatch(renderLink(), /Unknown future:constant/);
    registry['pluginsById'].delete('future');

    const output: OutputConfig = {
        plugin: 'future',
        id: 'future.device',
        links: [link, {plugin: 'constant', kind: 'constant', level: 0.5}],
        pluginOptions: {preserve: true},
    };
    const outputAtom = atom(output);
    const outputMarkup = renderToStaticMarkup(createElement(
        Provider,
        {store},
        createElement(SettingsStateAtomProvider, {
            atom: atom({intifaceConnected: false} as SettingsStatePayload),
            children: createElement(OutputEditor, {outputAtom, infoAtom: atom(undefined), onDelete() {}}),
        }),
    ));
    assert.match(outputMarkup, /Unknown output future:future.device/);
    assert.match(outputMarkup, /<span[^>]*MuiTypography-caption[^>]*>Plugin Unavailable<\/span>/);
    assert.match(outputMarkup, /No plugin handles this output/);
    assert.match(outputMarkup, /Unknown future:future.link/);
    assert.match(outputMarkup, /Constant/);
    assert.match(outputMarkup, /Level \(50%\)/);
    assert.equal((outputMarkup.match(/aria-label="Enable link"/g) ?? []).length, 2);
    assert.equal((outputMarkup.match(/aria-label="Remove link"/g) ?? []).length, 2);
    const theme = createTheme();
    assert.ok(outputMarkup.includes(`border-radius:50%;background-color:${theme.palette.warning.main};`));
    assert.doesNotMatch(outputMarkup, /Intiface is not connected/);
    assert.deepEqual(store.get(outputAtom), output);

    const knownOutput: OutputConfig = {
        plugin: 'intiface',
        id: 'intiface.1.0',
        links: [{plugin: 'constant', kind: 'constant', level: 0.4}, link],
        preferLinear: true,
        linear: {min: 0.2},
    };
    const knownAtom = atom(knownOutput);
    const ownerMarkup = renderToStaticMarkup(createElement(
        Provider,
        {store},
        createElement(SettingsStateAtomProvider, {
            atom: atom({intifaceConnected: true} as SettingsStatePayload),
            children: createElement(OutputEditor, {
                outputAtom: knownAtom,
                infoAtom: atom({
                    plugin: 'intiface',
                    id: 'intiface.1.0',
                    name: 'Known device',
                    connected: true,
                    showLinearActuatorOptions: true,
                    supportsLinearPreference: true,
                    currentLevel: 0,
                    lastLinkValues: [0.4, 0],
                }),
                onDelete() {},
            }),
        }),
    ));
    assert.match(ownerMarkup, /Known device/);
    assert.match(ownerMarkup, /<span[^>]*MuiTypography-caption[^>]*>Intiface<\/span>/);
    assert.match(ownerMarkup, /Constant/);
    assert.match(ownerMarkup, /Unknown future:future.link/);
    assert.match(ownerMarkup, /Prefer absolute position over oscillation/);
    assert.match(ownerMarkup, /Advanced Stroker Settings/);
    assert.equal((ownerMarkup.match(/aria-label="Enable link"/g) ?? []).length, 2);
    assert.ok(ownerMarkup.includes(`border-radius:50%;background-color:${theme.palette.success.main};`));
    assert.deepEqual(store.get(knownAtom), knownOutput);
    const created = registry['pluginsById'].get('intiface').createOutput('new-device');
    assert.equal(created.plugin, 'intiface');
    assert.equal(created.id, 'new-device');
    assert.deepEqual(created.links.map((entry: OutputLink) => entry.plugin), ['vrchat', 'vrchat', 'vrchat']);
    assert.notEqual(created.links, registry['pluginsById'].get('intiface').createOutput('new-device').links);

    const {default: SettingsBody} = await server.ssrLoadModule('/src/frontend/components/settings/SettingsBody.tsx');
    const configAtom = atom({
        ...getDefaultConfig(),
        outputs: [{plugin: 'intiface', id: 'same', links: []}],
    });
    const info = {
        id: 'same',
        connected: true,
        showLinearActuatorOptions: false,
        supportsLinearPreference: false,
        currentLevel: 0,
        lastLinkValues: [],
    };
    const availableAtom = atom<OutputDeviceInfo>({...info, plugin: 'intiface', name: 'Available device'});
    const renderAvailable = () => renderToStaticMarkup(createElement(
        Provider,
        {store},
        createElement(UnconfiguredOutputRow, {
            outputAtom: availableAtom,
            linkOutputAtom: atom(null, () => {}),
        }),
    ));
    assert.match(renderAvailable(), /<span[^>]*MuiTypography-caption[^>]*>Intiface<\/span>/);
    store.set(availableAtom, {...store.get(availableAtom), plugin: 'future'});
    assert.match(renderAvailable(), /<span[^>]*MuiTypography-caption[^>]*>Plugin Unavailable<\/span>/);
    const settingsStateAtom = atom({
        intifaceConnected: true,
        vrchat: {connected: false, diagnostics: {detectedVrcConfigDirs: [], loggingFull: true, logsFound: true}},
        outputs: [
            {...info, plugin: 'intiface', name: 'Configured A'},
            {...info, plugin: 'future', name: 'Available B'},
        ],
    } as unknown as SettingsStatePayload);
    const renderSettings = () => renderToStaticMarkup(createElement(
        Provider,
        {store},
        createElement(SettingsStateAtomProvider, {
            atom: settingsStateAtom,
            children: createElement(SettingsBody, {configAtom, settingsStateAtom}),
        }),
    ));
    const oneConfigured = renderSettings();
    assert.match(oneConfigured, /Configured A/);
    assert.match(oneConfigured, /Available B/);
    assert.equal((oneConfigured.match(/aria-label="Unlink output"/g) ?? []).length, 1);
    assert.equal((oneConfigured.match(/>Link<\/button>/g) ?? []).length, 1);
    store.set(configAtom, {
        ...store.get(configAtom),
        outputs: [...store.get(configAtom).outputs, {plugin: 'future', id: 'same', links: []}],
    });
    const bothConfigured = renderSettings();
    assert.match(bothConfigured, /Configured A/);
    assert.match(bothConfigured, /Available B/);
    assert.equal((bothConfigured.match(/aria-label="Unlink output"/g) ?? []).length, 2);
    assert.equal((bothConfigured.match(/>Link<\/button>/g) ?? []).length, 0);
    assert.notEqual(outputKey({plugin: 'intiface', id: 'same'}), outputKey({plugin: 'future', id: 'same'}));
});
