import React, {useEffect, useState} from "react";
import {ipcRenderer} from "electron";

export default function AvatarParams({...rest}: {
} & React.HTMLAttributes<HTMLDivElement>) {
    const [values,setValues] = useState(new Map<string,unknown>());

    useEffect(() => {
        let destroyed = false;
        let timer: NodeJS.Timeout;
        async function update() {
            const status = await ipcRenderer.invoke("avatarParams:get");
            if (destroyed) return;
            setValues(status);
            timer = setTimeout(update, 100);
        }
        update();
        return () => {
            destroyed = true;
            clearInterval(timer);
        };
    }, []);

    if (values.size == 0) {
        return <div {...rest} style={{fontSize: "20px", padding: "40px", textAlign: "center"}}>
            No data yet.<br/>
            VRChat is probably still connecting.
        </div>;
    }

    return <div {...rest} style={{fontSize: "12px", columnWidth: "300px", padding: "10px"}}>
        {Array.from(values.entries())
            .sort(([ak,av],[bk,bv]) => ak.localeCompare(bk))
            .map(([key,value]) => {
                let valueColor = "#999";
                if (value === true) valueColor = "#0f0";
                if (value === false) valueColor = "#f00";
                return <div><span style={{color: "#999"}}>{key}</span>=<span style={{color: valueColor}}>{value+""}</span></div>;
        })}
    </div>;
}
