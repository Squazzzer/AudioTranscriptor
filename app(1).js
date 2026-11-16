let mediaRecorder;
let audioChunks = [];
let stream;
let recording = false;
let currentBlob = null;

const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const status = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');
const translationEl = document.getElementById('translation');
const downloadBtn = document.getElementById('downloadBtn');
const saveMetaBtn = document.getElementById('saveMetaBtn');
const historyEl = document.getElementById('history');

const sujetEl = document.getElementById('sujet');
const lieuEl = document.getElementById('lieu');
const personnesEl = document.getElementById('personnes');

// Charger métadonnées du jour
function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}
function loadMeta() {
  const key = getTodayKey();
  const meta = JSON.parse(localStorage.getItem('meta_' + key) || '{}');
  sujetEl.value = meta.sujet || '';
  lieuEl.value = meta.lieu || '';
  personnesEl.value = meta.personnes || '';
  renderHistory();
}
function saveMeta() {
  const key = getTodayKey();
  const meta = { sujet: sujetEl.value, lieu: lieuEl.value, personnes: personnesEl.value };
  localStorage.setItem('meta_' + key, JSON.stringify(meta));
  status.textContent = 'Métadonnées du jour enregistrées (cohérence)';
  renderHistory();
}
saveMetaBtn.addEventListener('click', saveMeta);
loadMeta();

function renderHistory() {
  const key = getTodayKey();
  const meta = JSON.parse(localStorage.getItem('meta_' + key) || '{}');
  const records = JSON.parse(localStorage.getItem('records_' + key) || '[]');
  historyEl.innerHTML = `<h3>Enregistrements du ${key}</h3>
    <div class="history-item"><strong>Contexte du jour :</strong> ${meta.sujet || '—'} | ${meta.lieu || '—'} | ${meta.personnes || '—'}</div>`;
  records.forEach((r, i) => {
    historyEl.innerHTML += `<div class="history-item">${r.time} — ${r.duration || '?'}s<br><small>${r.transcript?.slice(0, 120) || 'Pas de transcription'}...</small></div>`;
  });
}

// Conversion webm → wav (approximation client-side)
async function blobToWav(webmBlob) {
  const arrayBuffer = await webmBlob.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const wavBuffer = audioBufferToWav(audioBuffer);
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const samples = buffer.length;
  const dataLength = samples * numChannels * (bitDepth / 8);
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  }
  writeString(0, 'RIFF');
  view.setUint32(4, bufferLength - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  return arrayBuffer;
}

recordBtn.addEventListener('click', async () => {
  if (recording) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const webmBlob = new Blob(audioChunks, { type: 'audio/webm' });
      status.textContent = 'Conversion en .wav...';
      currentBlob = await blobToWav(webmBlob);
      downloadBtn.disabled = false;
      status.textContent = 'Enregistrement terminé — .wav prêt';
      
      // Sauvegarder dans l'historique local
      const key = getTodayKey();
      const records = JSON.parse(localStorage.getItem('records_' + key) || '[]');
      records.push({
        time: new Date().toLocaleTimeString(),
        duration: Math.round(webmBlob.size / 16000), // approx
        transcript: transcriptEl.value.slice(0, 200)
      });
      localStorage.setItem('records_' + key, JSON.stringify(records));
      renderHistory();

      startBasicTranscription();
      stream.getTracks().forEach(t => t.stop());
    };
    mediaRecorder.start();
    recording = true;
    recordBtn.classList.add('recording');
    recordBtn.textContent = '● Enregistrement...';
    stopBtn.disabled = false;
    status.textContent = '🎤 Enregistrement en cours (micro activé uniquement maintenant)';
  } catch (err) {
    status.textContent = 'Erreur : ' + err.message;
  }
});

stopBtn.addEventListener('click', () => {
  if (mediaRecorder && recording) {
    mediaRecorder.stop();
    recording = false;
    recordBtn.classList.remove('recording');
    recordBtn.textContent = '▶ Démarrer l\'enregistrement';
    stopBtn.disabled = true;
  }
});

downloadBtn.addEventListener('click', () => {
  if (!currentBlob) return;
  const meta = JSON.parse(localStorage.getItem('meta_' + getTodayKey()) || '{}');
  const name = `audio_${getTodayKey()}_${(meta.sujet || 'enreg').replace(/\s+/g,'_').slice(0,30)}_${Date.now()}.wav`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(currentBlob);
  a.download = name;
  a.click();
});

function startBasicTranscription() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    transcriptEl.value = 'Web Speech API non disponible. Utilisez le bot Grok pour une transcription professionnelle.';
    return;
  }
  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = 'fr-FR';
  recognition.continuous = true;
  recognition.interimResults = true;
  transcriptEl.value = 'Transcription basique en cours (recommandé : envoyer le .wav au bot Grok)...';
  recognition.onresult = (e) => {
    let text = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      text += e.results[i][0].transcript + ' ';
    }
    transcriptEl.value = text.trim();
  };
  recognition.start();
  setTimeout(() => recognition.stop(), 8000);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js');
}