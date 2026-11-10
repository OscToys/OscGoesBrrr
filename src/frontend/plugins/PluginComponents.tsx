import React from 'react';
import {plugins} from './plugins';
import type {PluginSettingsProps} from './Plugin';

export function PluginSettings(props: PluginSettingsProps) {
    return <>{plugins.map((plugin, index) => plugin.Settings && <plugin.Settings key={index} {...props} />)}</>;
}

export function PluginRuntimes() {
    return <>{plugins.map((plugin, index) => plugin.Runtime && <plugin.Runtime key={index} />)}</>;
}
