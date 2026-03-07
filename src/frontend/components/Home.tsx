import React from "react";
import StatusBox from "./StatusBox";

export default function Home() {
    return <div style={{display: 'flex', flexDirection: 'column', height: '100%'}}>

        <div style={{padding: '5px'}}>
            <h3 style={{textAlign: 'center'}}>Welcome to OscGoesBrrr!</h3>
            <ul style={{margin: 0}}>
                <li>Your avatar must be upgraded using the <a href="https://osc.toys/avatar" target="_blank">VRCFury
                    Haptics Upgrade Tool</a></li>
                <li>Your partner's avatar should be upgraded using the same tool.</li>
            </ul>
        </div>

        <div style={{display: 'flex', flex: 1}}>
            <div style={{display: 'flex', flexDirection: 'column', flex: 1, margin: '5px', textAlign: 'center'}}>
                <h3>VRChat Status</h3>
                <StatusBox style={{flex: 1}} getCmd="oscStatus:get" />
            </div>
        </div>
    </div>;
}
