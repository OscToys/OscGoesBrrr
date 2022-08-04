import { ipcRenderer } from 'electron';

function makeLog(eventName: string, elementName: string, clear = false) {
  const area = document.getElementById(elementName);
  if (!area || !(area instanceof HTMLTextAreaElement)) throw new Error('Log area missing');
  const outdated = document.getElementById('outdated');
  const log: string[] = [];
  let lastMouse = 0;
  area.onmousedown = () => {
    lastMouse = Date.now();
  }
  area.onmousemove = () => {
    if (lastMouse > Date.now() - 2000) lastMouse = Date.now();
  }
  ipcRenderer.on(eventName, (_event, text) => {
    if (eventName === 'oscStatus' && outdated) {
      const isOutdated = (text.includes('TPS_Internal') || text.includes('OGB/')) && !text.includes('/Version/8');
      outdated.style.display = isOutdated ? '' : 'none';
    }
    if (clear) log.length = 0;
    log.push(...text.split('\n'));
    while (log.length > 1000) log.shift();
    if (lastMouse < Date.now() - 2000) {
      area.value = log.join('\n');
      if (!clear) area.scrollTop = area.scrollHeight;
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  makeLog('oscLog', 'oscLog');
  makeLog('bioLog', 'bioLog');
  makeLog('bioStatus', 'bioStatus', true);
  makeLog('oscStatus', 'oscStatus', true);

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
