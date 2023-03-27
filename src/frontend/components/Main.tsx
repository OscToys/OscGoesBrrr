import React, {useEffect, useState} from "react";
import StatusBox, {LogBox} from "./StatusBox";
import ToggleableAudioHandler from "./AudioHandler";
import AdvancedConfig from "./AdvancedConfig";
// @ts-ignore
import logoPath from '../../icons/ogb-logo.png';
import Home from "./Home";
import classNames from "classnames";
import DebugLog from "./DebugLog";

export default function Main() {
    const [page,setPage] = useState<string>("home");

    function SelectButton(id: string, name: string) {
        return <div onClick={() => setPage(id)} className={classNames({active: page == id})}>{name}</div>;
    }

    return <div style={{display: 'flex', flexDirection: 'row', height: '100%'}}>
        <ToggleableAudioHandler/>

        <div className="leftColumn">
            <img src={logoPath}/>
            {SelectButton("home", "Home")}
            {SelectButton("logs", "Debug Logs")}
        </div>

        <div className="rightColumn">
            {page == "home" && <Home/>}
            {page == "logs" && <DebugLog/>}
        </div>
    </div>;
}
