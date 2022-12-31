import {useEffect, useState} from 'react';
import {ipcRenderer} from "electron";
import {Config} from '../common/configTypes';
import decodeType from "../common/decodeType";
import React from 'react';

export default function Settings() {
    const [error,setError] = useState(false);
    const [config,setConfig] = useState<undefined | Config>();
    const [saving,setSaving] = useState(false);

    // Load config when component mounts
    useEffect(() => {
        let closed = false;
        async function loadConfig() {
            try {
                const rawConfig = await ipcRenderer.invoke('config:get');
                const config = decodeType(rawConfig, Config);
                !closed && setConfig(config);
            } catch(e) {
                console.error(e);
                !closed && setError(true);
            }
        }
        return () => { closed = true; }
    }, []);

    const save = async () => {
        setSaving(true);
        await ipcRenderer.invoke('config:set', config);
        setSaving(false);
    };

    if (error) return "Error loading config";
    if (!config) return "Loading configuration ...";

    const toys = (config.toys ?? []).map(toy => {
        return <div>
            Toy: {toy.id}
            Sources: {(toy.sources ?? []).join(',')}
        </div>;
    });

    return <>
        <div>Toys:</div>
        <div>{toys}</div>
        {saving ? <div>Saving...</div> : null}
    </>;
}
