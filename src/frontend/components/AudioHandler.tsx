import {ipcRenderer} from "electron";
import React from "react";
import {useEffect, useState} from "react";

export default function ToggleableAudioHandler() {
    const [active,setActive] = useState(false);

    useEffect(() => {
        function onStart() { setActive(true); }
        function onStop() { setActive(false); }
        ipcRenderer.on('fft:start', onStart);
        ipcRenderer.on('fft:stop', onStop);
        return () => {
            ipcRenderer.off('fft:start', onStart);
            ipcRenderer.off('fft:stop', onStop);
        }
    }, []);

    return active ? <AudioHandler/> : null;
}

function AudioHandler() {
    useEffect(() => {
        let destroyed = false;
        let stream: MediaStream | undefined;
        let context: AudioContext | undefined;
        let analyzer: AnalyserNode | undefined;
        let fftInterval: ReturnType<typeof setInterval> | undefined;

        async function startFft() {
            console.log("Starting Audio Handler");
            if (stream) return;
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    mandatory: {
                        chromeMediaSource: 'desktop'
                    }
                },
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        maxWidth: 1,
                        maxHeight: 1,
                    }
                }
            } as any);
            if (destroyed) {
                stopFft();
                return;
            }
            context = new AudioContext();
            analyzer = context.createAnalyser();
            const source = context.createMediaStreamSource(stream);
            source.connect(analyzer);
            analyzer.fftSize = 1024;
            analyzer.smoothingTimeConstant = 0;
            analyzer.minDecibels = -50;
            analyzer.maxDecibels = -20;
            fftInterval = setInterval(sendFft, 50);
            console.log("Audio handler started");
        }
        startFft();

        async function sendFft() {
            if (!analyzer || !context) return;
            const binSizeHz = context.sampleRate / 2 / analyzer.frequencyBinCount;
            let data = new Uint8Array(analyzer.frequencyBinCount);
            analyzer.getByteFrequencyData(data);
            let max = 0;
            for (var i = 0; i < data.length; i++) {
                //var startFreq = binSizeHz * i;
                //if (startFreq > 300) break;
                let bin = data[i]!;
                if (bin < 0) bin = 0;
                if (bin > 255) bin = 255;
                max = Math.max(max, bin);
            }
            let level = 0;
            if (max > 0) {
                level = (max/255);
            }
            ipcRenderer.invoke('fft:status', level);
        }
        function stopFft() {
            console.log("Destroying Audio Handler");
            if (fftInterval) {
                clearInterval(fftInterval);
                fftInterval = undefined;
            }
            if (context) {
                context.close();
                context = undefined;
            }
            if (stream) {
                for (const track of stream.getTracks()) {
                    track.stop();
                }
                stream = undefined;
            }
        }

        return () => {
            destroyed = true;
            stopFft();
        };
    }, []);

    return null;
}
