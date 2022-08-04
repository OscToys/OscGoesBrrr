const path = require('path');

module.exports = {
    entry: './renderer',
    output: {
        path: path.resolve(__dirname, '../../app'),
        filename: 'preload.js'
    },
    target: 'electron-preload',
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: [{loader: 'ts-loader', options: {onlyCompileBundledFiles: true}}],
                exclude: /node_modules/,
            },
            {
                test: /\.s[ac]ss$/i,
                use: [
                    // Creates `style` nodes from JS strings
                    "style-loader",
                    // Translates CSS into CommonJS
                    "css-loader",
                    // Compiles Sass to CSS
                    "sass-loader",
                ],
            }
        ]
    },
    resolve: {
        extensions: ['', '.ts', '.tsx', '.js', '.jsx'],
    },
    mode: 'development',
};
