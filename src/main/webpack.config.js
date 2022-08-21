const path = require('path');
const webpack = require('webpack');

module.exports = {
    entry: './main',
    output: {
        path: path.resolve(__dirname, '../../app')
    },
    target: 'electron-main',
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: [{loader: 'ts-loader', options: {onlyCompileBundledFiles: true}}],
                exclude: /node_modules/,
            }
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
};
