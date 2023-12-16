import React from "react";
import {LogBox} from "./StatusBox";

export default function DebugLog() {
    return <div style={{display: 'flex', height: '100%'}}>
        <LogBox style={{flex: 1}} />
    </div>;
}
