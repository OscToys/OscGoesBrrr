import React from "react";
import {LogBox} from "./StatusBox";

export default function DebugLog() {
    return <div style={{display: 'flex', height: '100%'}}>
        <div style={{display: 'flex', flexDirection: 'column', flex: 1, margin: '5px', textAlign: 'center'}}>
            <h3>Intiface Log</h3>
            <LogBox style={{flex: 1}} eventName="bioLog" />
        </div>
        <div style={{display: 'flex', flexDirection: 'column', flex: 1, margin: '5px', textAlign: 'center'}}>
            <h3>VRChat Log</h3>
            <LogBox style={{flex: 1}} eventName="oscLog" />
        </div>
    </div>;
}
