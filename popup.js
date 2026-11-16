let mediaRecorder, stream, chunks = [], recording = false, currentWav = null;

const recordBtn = document.getElementById('record');
const downloadBtn = document.getElementById('download');
const status = document.getElementById('status');
const transcript = document.getElementById('transcript');

function getToday() { return new Date().toISOString().slice(0,10); }

chrome.storage.local.get(['meta_' + getToday()], (res) => {
  const m = res['meta_' + getToday()] || {};
  document.getElementById('sujet').value = m.sujet || '';
  document.getElementById('lieu').value = m.lieu || '';
  document.getElementById('personnes').value = m.personnes || '';
});

recordBtn.addEventListener('click', async () => {
  if (recording) {
    mediaRecorder.stop();
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    chunks = [];
    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const webm = new Blob(chunks, { type: 'audio/webm' });
      // Conversion simple (réutiliser logique PWA si besoin)
      currentWav = webm; // placeholder — conversion complète dans PWA
      downloadBtn.disabled = false;
      status.textContent = 'Terminé — prêt au téléchargement';
      stream.getTracks().forEach(t => t.stop());
      recording = false;
      recordBtn.textContent = '▶ Démarrer';
      recordBtn.classList.remove('recording');
      // Sauvegarder meta
      const meta = {
        sujet: document.getElementById('sujet').value,
        lieu: document.getElementById('lieu').value,
        personnes: document.getElementById('personnes').value
      };
      chrome.storage.local.set({ ['meta_' + getToday()]: meta });
    };
    mediaRecorder.start();
    recording = true;
    recordBtn.textContent = '■ Arrêter';
    recordBtn.classList.add('recording');
    status.textContent = 'Enregistrement en cours...';
  } catch (e) {
    status.textContent = 'Erreur micro: ' + e.message;
  }
});

downloadBtn.addEventListener('click', () => {
  if (!currentWav) return;
  const url = URL.createObjectURL(currentWav);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audio_${getToday()}.webm`;
  a.click();
});