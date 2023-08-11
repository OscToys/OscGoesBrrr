import React, {useEffect, useState} from "react";
import StatusBox, {LogBox} from "./StatusBox";
import ToggleableAudioHandler from "./AudioHandler";
import AdvancedConfig from "./AdvancedConfig";
// @ts-ignore
import logoPath from '../../icons/ogb-logo.png';
import Home from "./Home";
import classNames from "classnames";
import DebugLog from "./DebugLog";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import type {IconDefinition} from "@fortawesome/fontawesome-common-types";
import {faBarsStaggered, faCircleNodes, faHome, faPeopleGroup, faTerminal} from "@fortawesome/free-solid-svg-icons";
import AvatarParams from "./AvatarParams";

export default function Main() {
    const [page,setPage] = useState<string>("home");

    function SelectButton(id: string, name: string, icon?: IconDefinition, onClick?: ()=>any) {
        return <div onClick={onClick ? onClick : () => setPage(id)} className={classNames({active: page == id})}>
            {icon && <FontAwesomeIcon icon={icon} />}
            <span>{name}</span>
        </div>;
    }

    return <div style={{display: 'flex', flexDirection: 'row', height: '100%'}}>
        <ToggleableAudioHandler/>

        <div className="leftColumn">
            <img src={logoPath}/>
            {SelectButton("home", "Home", faHome)}
            {SelectButton("logs", "Debug Logs", faTerminal)}
            {SelectButton("avatarParams", "Avatar Debugger", faBarsStaggered)}
            {SelectButton("discord", "Support Discord", faDiscord, () => window.open("https://osc.toys/discord", "_blank"))}
            {SelectButton("vrcgroup", "VRChat Group", faCircleNodes, () => window.open("https://vrchat.com/home/group/grp_b64197f9-2d97-499a-93d3-1e3a37c944ae", "_blank"))}
        </div>

        <div className="rightColumn">
            {page == "home" && <Home/>}
            {page == "logs" && <DebugLog/>}
            {page == "avatarParams" && <AvatarParams/>}
        </div>
    </div>;
}
