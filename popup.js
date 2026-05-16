document.addEventListener('DOMContentLoaded', () => {
  const papagoIdInput = document.getElementById('papagoId');
  const papagoSecretInput = document.getElementById('papagoSecret');
  const clovaSecretInput = document.getElementById('clovaSecret');
  const saveBtn = document.getElementById('saveBtn');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusDiv = document.getElementById('status');

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

  saveBtn.addEventListener('click', () => {
    chrome.storage.local.set({ 
      papagoId: papagoIdInput.value, 
      papagoSecret: papagoSecretInput.value, 
      clovaSecret: clovaSecretInput.value 
    }, () => {
      alert('Settings saved.');
    });
  });

  startBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      // 사용자 인터랙션(클릭) 시점에 직접 streamId 생성 (MV3 필수 요구사항)
      chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (streamId) => {
        if (!streamId) {
          alert('Start failed: Could not get stream ID. Please ensure the tab has audio.');
          return;
        }

        chrome.runtime.sendMessage({ 
          action: 'start_translation', 
          streamId: streamId,
          tabId: tab.id
        }, (response) => {
          if (response && response.success) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            statusDiv.innerText = 'Status: Running';
          } else {
            alert('Start failed: ' + (response ? response.error : 'Unknown error'));
          }
        });
      });
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stop_translation' }, (response) => {
      startBtn.disabled = false;
      stopBtn.disabled = true;
      statusDiv.innerText = 'Status: Idle';
    });
  });
});
