import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'vite';

test('Vite eagerly discovers backend and frontend plugin entry points without importing helper files', async () => {
    const server = await createServer({
        configFile: false,
        appType: 'custom',
        server: {middlewareMode: true, hmr: false},
        optimizeDeps: {noDiscovery: true},
    });
    try {
        const result = await server.transformRequest('/src/main/plugins/registerPlugins.ts');
        assert.ok(result);
        for (const path of [
            'audio/main/AudioPlugin.ts',
            'constant/main/ConstantPlugin.ts',
            'intiface/main/IntifacePlugin.ts',
            'vrchat/main/VrchatPlugin.ts',
        ]) {
            assert.ok(result.code.includes(`/src/plugins/${path}`), path);
        }
        assert.equal(result.code.includes('import.meta.glob'), false);
        assert.equal(result.code.includes('.test.ts'), false);
        assert.equal(result.code.includes('IntifaceSettings.ts'), false);
        assert.equal(result.code.includes('VrchatDiagnostics.ts'), false);
        assert.equal(result.code.includes('/frontend/'), false);
        assert.equal(result.code.includes('/shared/'), false);
        const frontend = await server.transformRequest('/src/frontend/plugins/plugins.ts');
        assert.ok(frontend);
        for (const path of [
            'audio/frontend/AudioPlugin.ts',
            'constant/frontend/ConstantPlugin.ts',
            'intiface/frontend/IntifacePlugin.ts',
            'vrchat/frontend/VrchatPlugin.ts',
        ]) {
            assert.ok(frontend.code.includes(`/src/plugins/${path}`), path);
        }
        assert.equal(frontend.code.includes('import.meta.glob'), false);
        assert.equal(frontend.code.includes('AudioHandler.tsx'), false);
        assert.equal(frontend.code.includes('.test.ts'), false);
        assert.equal(frontend.code.includes('/main/'), false);
        assert.equal(frontend.code.includes('/shared/'), false);
    } finally {
        await server.close();
    }
});
