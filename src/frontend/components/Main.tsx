import React, {useEffect, useState} from "react";
import StatusBox, {LogBox} from "./StatusBox";
import ToggleableAudioHandler from "./AudioHandler";
// @ts-ignore
import logoPath from '../../icons/ogb-logo.png';
import Home from "./Home";
import classNames from "classnames";
import DebugLog from "./DebugLog";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import {IconDefinition} from "@fortawesome/fontawesome-common-types";
import {
    faBarsStaggered,
    faCircleNodes,
    faClipboard,
    faHome,
    faPeopleGroup,
    faTerminal
} from "@fortawesome/free-solid-svg-icons";
import AvatarParams from "./AvatarParams";
import {faGear} from "@fortawesome/free-solid-svg-icons/faGear";
import Settings from "./Settings";
import {Config} from "../../common/configTypes";
import {ipcRenderer} from "electron";
import {Toast, ToastContainer} from "react-bootstrap";

export default function Main() {
    const [page,setPage] = useState<string>("home");
    const [showAdv,setShowAdv] = useState(false);
    const [showCopyToast,setShowCopyToast] = useState(false);

    function SelectButton(id: string, name: string, icon?: IconDefinition, onClick?: ()=>any) {
        return <div onClick={onClick ? onClick : () => setPage(id)} className={classNames({active: page == id})}>
            {icon && <FontAwesomeIcon icon={icon} fixedWidth={true} />}
            <span>{name}</span>
        </div>;
    }

    async function copyConfig() {
        const config = await ipcRenderer.invoke('config:get');
        await navigator.clipboard.writeText(JSON.stringify(config, null, 4));
        setShowCopyToast(true);
    }

    return <div style={{display: 'flex', flexDirection: 'row', height: '100%'}} data-bs-theme="dark">
        <ToggleableAudioHandler/>

        <div className="leftColumn">
            <img src={logoPath} onMouseDown={e => { if (e.button == 2) setShowAdv(!showAdv) }}/>
            {showAdv && <div onClick={copyConfig}><FontAwesomeIcon icon={faClipboard} fixedWidth={true} /><span>Copy config</span></div>}
            {SelectButton("home", "Home", faHome)}
            {SelectButton("logs", "Debug Logs", faTerminal)}
            {SelectButton("settings", "Settings", faGear)}
            {SelectButton("avatarParams", "Avatar Debugger", faBarsStaggered)}
            {SelectButton("discord", "Support Discord", faDiscord, () => window.open("https://osc.toys/discord", "_blank"))}
            {SelectButton("vrcgroup", "VRChat Group", faCircleNodes, () => window.open("https://vrchat.com/home/group/grp_b64197f9-2d97-499a-93d3-1e3a37c944ae", "_blank"))}
        </div>

        <div className="rightColumn">
            {page == "home" && <Home/>}
            {page == "logs" && <DebugLog/>}
            {page == "settings" && <Settings/>}
            {page == "avatarParams" && <AvatarParams/>}
        </div>

        <ToastContainer position="top-end" className="p-3">
        <Toast onClose={() => setShowCopyToast(false)} show={showCopyToast} delay={3000} autohide>
            <Toast.Body><FontAwesomeIcon icon={faClipboard}/> Raw config copied to clipboard</Toast.Body>
        </Toast>
        </ToastContainer>
    </div>;
}
