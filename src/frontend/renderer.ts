import { ipcRenderer } from 'electron';
import * as ReactDOM from 'react-dom/client';

// @ts-ignore
import style1 from './bootstrap.css';
// @ts-ignore
import style2 from './styles.css';
import Main from "./components/Main";
import React from "react";

window.addEventListener('DOMContentLoaded', async () => {
  style1.use();
  style2.use();
  const div = document.createElement("div");
  div.id = "maindiv";
  document.body.appendChild(div);
  const root = ReactDOM.createRoot(div);
  await new Promise(resolve => {
    root.render(React.createElement(Main, {onRendered: () => resolve(null)}));
  });

  const save = document.getElementById('save');
  if (!save) throw new Error('Save button missing');
  const saved = document.getElementById('saved');
  if (!saved) throw new Error('Saved text missing');
  const config = document.getElementById('advancedConfig');
  if (!(config instanceof HTMLTextAreaElement)) throw new Error('Config not textarea');
  ipcRenderer.invoke('config:load').then(txt => config.value = txt);
  config.onchange = () => {
    saved.style.display = 'none';
  }
  ipcRenderer.on('config:saved', () => {
    saved.style.display = '';
  });
  save.onclick = () => {
    ipcRenderer.invoke('config:save', config.value);
  }
});

(window as any).testRenderer = ipcRenderer;

ipcRenderer.on('fft:start', async (_event, text) => {
  startFft();
});
ipcRenderer.on('fft:stop', async (_event, text) => {
  stopFft();
});

let stream: MediaStream | undefined;
let context: AudioContext | undefined;
let analyzer: AnalyserNode | undefined;
let fftInterval: ReturnType<typeof setInterval> | undefined;
async function startFft() {
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
  } as any)
  context = new AudioContext();
  analyzer = context.createAnalyser();
  const source = context.createMediaStreamSource(stream);
  source.connect(analyzer);
  analyzer.fftSize = 1024;
  analyzer.smoothingTimeConstant = 0;
  analyzer.minDecibels = -50;
  analyzer.maxDecibels = -20;
  fftInterval = setInterval(sendFft, 50);
}
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
async function stopFft() {
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
