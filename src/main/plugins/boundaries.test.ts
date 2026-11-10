import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import {test} from 'node:test';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('shared application code does not refer to specific integrations', async () => {
    const root = new URL('../../', import.meta.url);
    async function check(directory: URL): Promise<void> {
        for (const entry of await readdir(directory, {withFileTypes: true})) {
            if (entry.name === 'plugins') continue;
            const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
            if (entry.isDirectory()) {
                await check(path);
            } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
                const source = await readFile(path, 'utf8');
                assert.doesNotMatch(
                    source,
                    /\b(?:vrchat|intiface|audio|constant|systemAudio|useIntifaceMdns|useOscQuery|sps|fft)\b/i,
                    path.pathname,
                );
            }
        }
    }
    await check(root);
});

test('colocated plugin code keeps main, frontend and shared imports separated', async () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const pluginRoot = new URL('../../plugins/', import.meta.url);
    async function check(directory: URL): Promise<void> {
        for (const entry of await readdir(directory, {withFileTypes: true})) {
            const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
            if (entry.isDirectory()) {
                await check(url);
                continue;
            }
            if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) continue;
            const filename = fileURLToPath(url);
            const layer = path.relative(root, filename).split(path.sep)[2];
            const source = await readFile(url, 'utf8');
            for (const match of source.matchAll(/(?:from\s+|import\s+|import\()['"]([^'"]+)['"]/g)) {
                const specifier = match[1]!;
                if (layer !== 'main') assert.notEqual(specifier, 'electron', filename);
                if (!specifier.startsWith('.')) continue;
                const target = path.relative(root, path.resolve(path.dirname(filename), specifier)).split(path.sep);
                const targetLayer = target[0] === 'plugins' ? target[2] : target[0];
                if (layer === 'shared') {
                    assert.notEqual(targetLayer, 'main', filename);
                    assert.notEqual(targetLayer, 'frontend', filename);
                } else {
                    assert.notEqual(targetLayer, layer === 'main' ? 'frontend' : 'main', filename);
                }
            }
        }
    }
    await check(pluginRoot);
});
