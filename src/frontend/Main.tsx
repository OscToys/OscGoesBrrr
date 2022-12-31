import React, {useEffect} from "react";

export default function Main(props: {
    onRendered: () => void
}) {
    useEffect(() => {
        props.onRendered();
    },[]);

    return <div style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
        <div style={{padding: '5px'}}>
            <h1 style={{textAlign: 'center'}}>OSC Goes Brrr</h1>
            <ul style={{margin: 0}}>
                <li>Your avatar must be upgraded using the <a href="https://vrcfury.com/brrrupgrade" target="_blank">VRCFury
                    OscGB Upgrade Tool</a></li>
                <li>Your partner's avatar should be upgraded using the same tool.</li>
                <li>If their avatar is not upgraded, you can still interact with their Hands, Feet, Head, or
                    stock Poi 8.1 TPS penetrators (limited).</li>
                <li>To enable interaction between a penetrator and orifice both on your own avatar,
                    add <i>all.penSelf=1</i> to the Advanced Config.</li>
                <li>To enable touching your own penetrator with your own hands,
                    add <i>all.touchSelf=1</i> to the Advanced Config.</li>
                <li>For support, <a href="https://vrcfury.com/discord" target="_blank">click here to
                    join the discord</a>.</li>
            </ul>
        </div>
        <div style={{display: 'flex', flex: 1}}>
            <div style={{display: 'flex', flexDirection: 'column', flex: 1, margin: '5px', textAlign: 'center'}}>
                <h3>Buttplug.io Status</h3>
                <textarea style={{flex: 1}} id="bioStatus" readOnly wrap="off" defaultValue={""} />
            </div>
            <div style={{display: 'flex', flexDirection: 'column', flex: 1, margin: '5px', textAlign: 'center'}}>
                <h3>OSC Status</h3>
                <textarea style={{flex: 1}} id="oscStatus" readOnly wrap="off" defaultValue={""} />
            </div>
            <div style={{display: 'flex', flexDirection: 'column', flex: 1, margin: '5px', textAlign: 'center'}}>
                <h3>Advanced Config <a href="https://vrcfury.com/brrradv" target="_blank">(?)</a></h3>
                <textarea style={{flex: 1}} id="advancedConfig" spellCheck="false" defaultValue={""} />
                <div style={{textAlign: 'left'}}>
                    <input type="button" defaultValue="Save" id="save" />
                    <span id="saved" style={{display: 'none'}}>Saved</span>
                </div>
            </div>
        </div>
        <div style={{display: 'flex', flexBasis: '300px'}}>
            <div style={{display: 'flex', flexDirection: 'column', flex: 1, margin: '5px', textAlign: 'center'}}>
                <h3>Buttplug.io Log</h3>
                <textarea style={{flex: 1}} id="bioLog" defaultValue={""} />
            </div>
            <div style={{display: 'flex', flexDirection: 'column', flex: 1, margin: '5px', textAlign: 'center'}}>
                <h3>OSC Log</h3>
                <textarea style={{flex: 1}} id="oscLog" defaultValue={""} />
            </div>
        </div>
    </div>;
}
