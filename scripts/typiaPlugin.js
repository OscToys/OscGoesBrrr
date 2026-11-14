import path from 'node:path';
import {TtscCompiler} from 'ttsc';

// The generic adapter repeatedly proves the entire Go toolchain/input graph.
// This project only needs one transform per source revision, shared by modules.
export default function typiaPlugin(project, projectRoot = path.join(process.cwd(), 'src')) {
    const cwd = process.cwd();
    const compiler = new TtscCompiler({
        cwd,
        tsconfig: project,
        projectRoot,
    });
    let generation;
    let server;
    let stopWatching;
    const importers = new Set();
    const invalidate = () => { generation = undefined; };
    return {
        name: 'typia-project',
        enforce: 'pre',
        buildStart: invalidate,
        watchChange: invalidate,
        closeBundle() {
            stopWatching?.();
            invalidate();
            importers.clear();
        },
        configureServer(next) {
            stopWatching?.();
            server = next;
            // Include type-only edits and new files, not just runtime imports.
            server.watcher.add(projectRoot);
            const changed = (_event, file) => {
                if (!/\.(?:[cm]?tsx?|json|go|mod|sum)$/.test(file)) return;
                invalidate();
                for (const id of importers) {
                    const module = server.moduleGraph.getModuleById(id);
                    if (module) server.moduleGraph.invalidateModule(module);
                }
                if (importers.size) server.ws.send({type: 'full-reload'});
            };
            server.watcher.on('all', changed);
            stopWatching = () => next.watcher.off('all', changed);
        },
        transform: {
            filter: {code: /\btypia\b/},
            async handler(source, id) {
                const filename = id.split('?')[0];
                if (!/\.[cm]?tsx?$/.test(filename) || /[/\\]node_modules[/\\]/.test(filename)) return null;
                importers.add(filename);
                let pending;
                let result;
                // An edit during compilation must not publish the old generation.
                do {
                    pending = generation ??= compiler.transformAsync().catch(error => {
                        if (generation === pending) invalidate();
                        throw error;
                    });
                    result = await pending;
                } while (pending !== generation);
                if (result.type !== 'success') {
                    generation = undefined;
                    this.error(`typia: ${JSON.stringify(result)}`);
                }
                const inputs = new Set([
                    project,
                    ...Object.keys(result.typescript),
                    ...Object.keys(result.graph?.inputObservations ?? {}),
                    ...(result.graph?.configs ?? []),
                    ...(result.hostInputs ?? []),
                ].map(file => path.resolve(projectRoot, file)));
                if (server) server.watcher.add([...inputs]);
                else for (const file of inputs) this.addWatchFile(file);
                const key = path.relative(projectRoot, filename).replaceAll('\\', '/');
                const code = result.typescript[key] ?? result.typescript[filename.replaceAll('\\', '/')];
                if (code === undefined) this.error(`typia: ${filename} is missing from ${project}`);
                return {code, map: null};
            },
        },
    };
}
