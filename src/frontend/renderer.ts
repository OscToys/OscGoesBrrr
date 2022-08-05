import { ipcRenderer } from 'electron';

function makeLog(eventName: string, elementName: string, clear = false) {
  const logUpdater = getLogUpdater(elementName, clear);
  ipcRenderer.on(eventName, (_event, text) => {
    logUpdater(text);
  });
}

function getLogUpdater(elementName: string, clear = false) {
  const area = document.getElementById(elementName);
  const log: string[] = [];
  if (!area || !(area instanceof HTMLTextAreaElement)) throw new Error('Log area missing');
  let lastMouse = 0;
  area.onmousedown = () => {
    lastMouse = Date.now();
  }
  area.onmousemove = () => {
    if (lastMouse > Date.now() - 2000) lastMouse = Date.now();
  }
  return (text: string) => {
    if (clear) log.length = 0;
    log.push(...text.split('\n'));
    while (log.length > 1000) log.shift();
    if (lastMouse < Date.now() - 2000) {
      area.value = log.join('\n');
      if (!clear) area.scrollTop = area.scrollHeight;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  makeLog('oscLog', 'oscLog');
  makeLog('bioLog', 'bioLog');

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

  const oscStatusUpdater = getLogUpdater('oscStatus', true);
  async function updateOscStatus() {
    try {
      const status = await ipcRenderer.invoke('oscStatus:get');
      oscStatusUpdater(status);
    } catch(e) { console.error(e); }
    setTimeout(updateOscStatus, 100);
  }
  updateOscStatus();

  const bioStatusUpdater = getLogUpdater('bioStatus', true);
  async function updateBioStatus() {
    try {
      const status = await ipcRenderer.invoke('bioStatus:get');
      bioStatusUpdater(status);
    } catch(e) { console.error(e); }
    setTimeout(updateBioStatus, 100);
  }
  updateBioStatus();
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
