import path from 'node:path';
import webpack from 'webpack';
import {fileURLToPath} from "node:url";
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default {
    entry: './main',
    output: {
        path: path.resolve(__dirname, '../../app'),
        publicPath: 'app/',
    },
    target: 'electron-main',
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: [{loader: 'ts-loader', options: {onlyCompileBundledFiles: true}}],
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
