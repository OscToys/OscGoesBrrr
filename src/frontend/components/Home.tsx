import React, {useEffect} from "react";
import StatusBox, {LogBox} from "./StatusBox";
import ToggleableAudioHandler from "./AudioHandler";
import AdvancedConfig from "./AdvancedConfig";
// @ts-ignore
import logoPath from '../../icons/ogb-logo.png';

export default function Home() {
    return <div style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
        <div style={{padding: '5px'}}>
            <h3 style={{textAlign: 'center'}}>Welcome to OscGoesBrrr!</h3>
            <ul style={{margin: 0}}>
                <li>Your avatar must be upgraded using the <a href="https://osc.toys/avatar" target="_blank">VRCFury
                    Haptics Upgrade Tool</a></li>
                <li>Your partner's avatar should be upgraded using the same tool.</li>
                <li>If their avatar is not upgraded, you can still interact with their Hands, Feet, Head, or
                    stock Poi 8.1 TPS penetrators (limited).</li>
                <li>To enable interaction between a penetrator and orifice both on your own avatar,
                    add <i>all.penSelf=1</i> in the Settings box.</li>
                <li>To enable touching your own penetrator with your own hands,
                    add <i>all.touchSelf=1</i> in the Settings box.</li>
            </ul>
        </div>

        <div style={{display: 'flex', flex: 1}}>
            <div style={{display: 'flex', flexDirection: 'column', flex: 1, margin: '5px', textAlign: 'center'}}>
                <h3>Intiface Status</h3>
                <StatusBox style={{flex: 1}} getCmd="bioStatus:get" />
            </div>
            <div style={{display: 'flex', flexDirection: 'column', flex: 1, margin: '5px', textAlign: 'center'}}>
                <h3>VRChat Status</h3>
                <StatusBox style={{flex: 1}} getCmd="oscStatus:get" />
            </div>
            <div style={{display: 'flex', flexDirection: 'column', flex: 1, margin: '5px', textAlign: 'center'}}>
                <h3>Settings <a href="https://osc.toys/advanced" target="_blank">(?)</a></h3>
                <AdvancedConfig/>
            </div>
        </div>
    </div>;
}
