import path from 'node:path';
import {fileURLToPath} from "node:url";
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default {
    entry: './renderer',
    output: {
        path: path.resolve(__dirname, '../../app'),
        filename: 'preload.js',
        publicPath: '',
    },
    target: 'electron-renderer',
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: [{loader: 'ts-loader', options: {onlyCompileBundledFiles: true}}],
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
    mode: 'development',
    watchOptions: {
        poll: 1000,
    },
};
