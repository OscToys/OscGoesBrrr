import React, {useEffect, useState} from "react";
import {ipcRenderer} from "electron";

export default function AdvancedConfig() {
    const [showSaved,setShowSaved] = useState(false);
    const [content,setContent] = useState("");
    const [loaded,setLoaded] = useState(false);

    useEffect(() => {
        let destroyed = false;
        (async() => {
            const text = await ipcRenderer.invoke('config:load');
            if (destroyed) return;
            setContent(text);
            setLoaded(true);
        })();
        return () => {
            destroyed = true;
        }
    }, []);

    useEffect(() => {
        function onSaved() {
            setShowSaved(true);
        }
        ipcRenderer.on('config:saved', onSaved);
        return () => { ipcRenderer.off('config:saved', onSaved); };
    }, []);

    if (!loaded) return null;
    return <>
        <textarea
            style={{flex: 1}}
            spellCheck="false"
            value={content}
            onChange={(e) => { setContent(e.target.value); setShowSaved(false); }}
        />
        <div style={{textAlign: 'left'}}>
            <input
                type="button"
                defaultValue="Save"
                onClick={() => { ipcRenderer.invoke('config:save', content) }} />
            {showSaved ? <span>Saved</span> : null}
        </div>
    </>;
}
