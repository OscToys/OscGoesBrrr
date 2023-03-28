import React, {useEffect, useRef, useState} from "react";
import {ipcRenderer} from "electron";
import {useLatest} from "react-use";

export default function StatusBox({getCmd, ...rest}: {
    getCmd: string
} & React.HTMLAttributes<HTMLTextAreaElement>) {
    const [status,setStatus] = useState("");

    useEffect(() => {
        let destroyed = false;
        let timer: NodeJS.Timeout;
        async function update() {
            const status = await ipcRenderer.invoke(getCmd);
            if (destroyed) return;
            setStatus(status);
            timer = setTimeout(update, 100);
        }
        update();
        return () => {
            destroyed = true;
            clearInterval(timer);
        };
    }, []);

    return <FreezingBox
        content={status}
        {...rest}
    />;
}

export function LogBox({eventName, ...rest}: {
    eventName: string
} & React.HTMLAttributes<HTMLTextAreaElement>) {
    const [status,setStatus] = useState("");

    useEffect(() => {
        const lines: string[] = [];
        function onEvent(_event: Electron.IpcRendererEvent, text: any) {
            lines.push(...text.split('\n'));
            while (lines.length > 1000) lines.shift();
            setStatus(lines.join('\n'));
        }
        ipcRenderer.on(eventName, onEvent);
        return () => { ipcRenderer.off(eventName, onEvent) };
    }, []);

    return <FreezingBox
        content={status}
        scrollOnChange={true}
        {...rest}
    />;
}

function FreezingBox({content, scrollOnChange = false, ...rest}: {
    content: string,
    scrollOnChange?: boolean
} & React.HTMLAttributes<HTMLTextAreaElement>) {
    const latestContent = useLatest(content);
    const [liveContent,setLiveContent] = useState(content);
    const lastMouse = useRef(0);
    const area = useRef<HTMLTextAreaElement>(null);

    function resetFreezeTimer() {
        lastMouse.current = Date.now();
    }
    function resetFreezeTimerIfFrozen() {
        if (lastMouse.current > Date.now() - 2000) lastMouse.current = Date.now();
    }
    useEffect(() => {
        function update() {
            if (lastMouse.current < Date.now() - 2000) {
                setLiveContent(latestContent.current);
            }
        }
        const timer = setInterval(update, 100);
        return () => {
            clearInterval(timer);
        };
    }, []);
    useEffect(() => {
        if (scrollOnChange && area.current) {
            area.current.scrollTop = area.current.scrollHeight;
        }
    }, [liveContent]);

    return <textarea
        style={{flex: 1}}
        readOnly
        wrap="off"
        onMouseMove={resetFreezeTimerIfFrozen}
        onMouseDown={resetFreezeTimer}
        onScroll={resetFreezeTimer}
        value={liveContent}
        ref={area}
        {...rest}
    />;
}
