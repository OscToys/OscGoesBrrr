import React, {useState} from "react";
import {PluginRuntimes} from '../plugins/PluginComponents';
import {pluginPages, pluginNavigation} from '../plugins/plugins';
// @ts-ignore
import logoPath from '../../icons/ogb-logo.png';
import Settings from "./settings/Settings";
import classNames from "classnames";
import DebugLog from "./DebugLog";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import {IconDefinition} from "@fortawesome/fontawesome-common-types";
import {faHome, faTerminal} from "@fortawesome/free-solid-svg-icons";
import PageErrorBoundary from "./PageErrorBoundary";

export default function Main() {
    const [page,setPage] = useState<string>("home");

    function SelectButton(id: string, name: string, icon?: IconDefinition, onClick?: ()=>any) {
        return <div onClick={onClick ? onClick : () => setPage(id)} className={classNames({active: page == id})}>
            {icon && <FontAwesomeIcon icon={icon} />}
            <span>{name}</span>
        </div>;
    }

    let pageContent: React.ReactNode = null;
    let pageName = "Unknown";
    if (page == "home") {
        pageName = "Home";
        pageContent = <Settings/>;
    } else if (page == "logs") {
        pageName = "Debug Logs";
        pageContent = <DebugLog/>;
    } else {
        const pluginPage = pluginPages.find(candidate => candidate.id === page);
        if (pluginPage) {
            pageName = pluginPage.label;
            pageContent = <pluginPage.Component />;
        }
    }

    return <div style={{display: 'flex', flexDirection: 'row', height: '100%'}}>
        <PluginRuntimes />

        <div className="leftColumn">
            <img src={logoPath}/>
            {SelectButton("home", "Home", faHome)}
            {SelectButton("logs", "Debug Logs", faTerminal)}
            {pluginPages.map(page => <React.Fragment key={page.id}>{SelectButton(page.id, page.label, page.icon)}</React.Fragment>)}
            {SelectButton("discord", "Support Discord", faDiscord, () => window.open("https://osc.toys/discord", "_blank"))}
            {pluginNavigation.map(item => <React.Fragment key={item.id}>{SelectButton(item.id, item.label, item.icon, () => window.open(item.href, "_blank"))}</React.Fragment>)}
        </div>

        <div className="rightColumn">
            <PageErrorBoundary key={page} pageName={pageName}>
                {pageContent}
            </PageErrorBoundary>
        </div>
    </div>;
}
