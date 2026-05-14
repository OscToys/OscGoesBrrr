import path from 'node:path';
import {fileURLToPath} from "node:url";
import typiaTransform from "typia/lib/transform";
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const config = (_env, argv) => {
    const mode = argv.mode ?? 'development';
    const isDevelopment = mode === 'development';
    return {
        context: __dirname,
        entry: './renderer',
        output: {
            path: path.resolve(__dirname, '../../app'),
            filename: 'preload.js',
            publicPath: '',
            devtoolModuleFilenameTemplate: 'file:///[absolute-resource-path]',
        },
        target: 'electron-renderer',
        // Inline maps are more reliable for Electron preload-loaded renderer bundles.
        devtool: isDevelopment ? 'inline-source-map' : false,
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: [{
                        loader: 'ts-loader',
                        options: {
                            configFile: path.resolve(__dirname, './tsconfig.json'),
                            onlyCompileBundledFiles: false,
                            getCustomTransformers: program => ({
                                before: [typiaTransform(program, undefined, { addDiagnostic: () => {} })]
                            })
                        }
                    }],
                    exclude: /node_modules/,
                },
                {
                    test: /\.css$/i,
                    use: [
                        { loader: "style-loader", options: { injectType: "lazyStyleTag" } },
                        "css-loader",
                    ],
                },
                {
                    test: /\.s[ac]ss$/i,
                    use: [
                        { loader: "style-loader", options: { injectType: "lazyStyleTag" } },
                        "css-loader",
                        "sass-loader",
                    ],
                },
                {
                    test: /\.(png)$/,
                    type: 'asset/resource',
                },
            ]
        },
        resolve: {
            extensions: ['', '.ts', '.tsx', '.js', '.jsx'],
        },
        mode,
        watchOptions: {
            poll: 1000,
        },
    };
};

// noinspection JSUnusedGlobalSymbols
export default config;
