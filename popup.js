document.addEventListener('DOMContentLoaded', () => {
  const papagoIdInput = document.getElementById('papagoId');
  const papagoSecretInput = document.getElementById('papagoSecret');
  const clovaSecretInput = document.getElementById('clovaSecret');
  const saveBtn = document.getElementById('saveBtn');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusDiv = document.getElementById('status');

  // 저장된 설정 불러오기
  chrome.storage.local.get(['papagoId', 'papagoSecret', 'clovaSecret', 'isRunning'], (res) => {
    if (res.papagoId) papagoIdInput.value = res.papagoId;
    if (res.papagoSecret) papagoSecretInput.value = res.papagoSecret;
    if (res.clovaSecret) clovaSecretInput.value = res.clovaSecret;
    
    if (res.isRunning) {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      statusDiv.innerText = 'Status: Running';
    }
  });

  // 설정 저장
  saveBtn.addEventListener('click', () => {
    const papagoId = papagoIdInput.value;
    const papagoSecret = papagoSecretInput.value;
    const clovaSecret = clovaSecretInput.value;
    
    chrome.storage.local.set({ papagoId, papagoSecret, clovaSecret }, () => {
      alert('Settings saved.');
    });
  });

  // 시작 버튼
  startBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'start_translation' }, (response) => {
      if (response && response.success) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        statusDiv.innerText = 'Status: Running';
      } else {
        alert('Start failed: ' + (response ? response.error : 'Unknown error'));
      }
    });
  });

  // 중지 버튼
  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stop_translation' }, (response) => {
      startBtn.disabled = false;
      stopBtn.disabled = true;
      statusDiv.innerText = 'Status: Idle';
    });
  });
});
