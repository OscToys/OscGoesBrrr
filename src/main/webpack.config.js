import path from 'node:path';
import webpack from 'webpack';
import {fileURLToPath} from "node:url";
import typiaTransform from 'typia/lib/transform.js';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default {
    context: __dirname,
    entry: './main',
    output: {
        path: path.resolve(__dirname, '../../app'),
        filename: 'main.bundle.js',
        publicPath: 'app/',
    },
    target: 'electron-main',
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: [{
                    loader: 'ts-loader',
                    options: {
                        configFile: path.resolve(__dirname, './tsconfig.json'),
                        onlyCompileBundledFiles: false,
                        getCustomTransformers: (program) => ({
                            before: [typiaTransform.default(program)]
                        })
                    }
                }],
                exclude: /node_modules/,
            },
            {
                test: /\.(ico|txt|html)$/,
                type: 'asset/resource',
            },
        ]
    },
    plugins: [
        new webpack.ContextReplacementPlugin(/keyv/),
        new webpack.DefinePlugin({
            'process.env.WS_NO_BUFFER_UTIL': 1,
            'process.env.WS_NO_UTF_8_VALIDATE': 1,
        })
    ],
    externals: {
        'bufferutil': 'commonjs2 doesnotexist',
        'utf-8-validate': 'commonjs2 doesnotexist',
        'native-reg': 'commonjs2 native-reg',
    },
    resolve: {
        extensions: ['', '.ts', '.tsx', '.js', '.jsx'],
    },
    mode: 'development',
    watchOptions: {
        poll: 1000,
    },
};
