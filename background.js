chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'start_translation') {
    startCapture(sendResponse);
    return true; 
  } else if (request.action === 'stop_translation') {
    stopCapture();
    sendResponse({ success: true });
  } else if (request.action === 'process_audio_chunk') {
    // offscreen에서 보낸 오디오 데이터 처리
    const blob = new Blob([new Uint8Array(request.payload)], { type: 'audio/webm' });
    processAudioChunk(blob);
  }
});

async function startCapture(sendResponse) {
  try {
    // 1. Offscreen Document 생성 (이미 있으면 무시됨)
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Capturing tab audio for translation'
    }).catch(() => {});

    // 2. 현재 탭의 streamId 가져오기
    chrome.tabCapture.getMediaStreamId({ targetTabId: (await chrome.tabs.query({active: true, currentWindow: true}))[0].id }, (streamId) => {
      if (!streamId) {
        sendResponse({ success: false, error: 'Failed to get stream ID' });
        return;
      }
      // 3. Offscreen에 캡처 시작 명령 전송
      chrome.runtime.sendMessage({
        target: 'offscreen',
        action: 'start_capture',
        streamId: streamId
      });
      
      chrome.storage.local.set({ isRunning: true });
      sendResponse({ success: true });
    });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function stopCapture() {
  chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'stop_capture'
  });
  
  chrome.storage.local.set({ isRunning: false });
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'clear_subtitle' });
    }
  });

  // Offscreen Document 닫기
  chrome.offscreen.closeDocument().catch(() => {});
}

async function processAudioChunk(blob) {
  const settings = await chrome.storage.local.get(['papagoId', 'papagoSecret', 'clovaSecret']);
  if (!settings.papagoId || !settings.papagoSecret) return;

  const recognizedText = await callClovaSTT(blob, settings.papagoId, settings.papagoSecret);
  
  if (recognizedText && recognizedText.trim()) {
    const translatedText = await callPapagoTranslate(recognizedText, settings.papagoId, settings.papagoSecret);
    
    if (translatedText) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'show_subtitle', text: translatedText });
        }
      });
    }
  }
}

async function callClovaSTT(blob, clientId, clientSecret) {
  try {
    const response = await fetch('https://naveropenapi.apigw.ntruss.com/recog/v1/stt?lang=jpn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-NCP-APIGW-API-KEY-ID': clientId,
        'X-NCP-APIGW-API-KEY': clientSecret
      },
      body: blob
    });
    
    const data = await response.json();
    return data.text;
  } catch (err) {
    console.error('STT Error:', err);
    return null;
  }
}

async function callPapagoTranslate(text, clientId, clientSecret) {
  try {
    const response = await fetch('https://papago.apigw.ntruss.com/nmt/v1/translation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-NCP-APIGW-API-KEY-ID': clientId,
        'X-NCP-APIGW-API-KEY': clientSecret
      },
      body: `source=ja&target=ko&text=${encodeURIComponent(text)}`
    });
    
    const data = await response.json();
    return data.message?.result?.translatedText;
  } catch (err) {
    console.error('Translate Error:', err);
    return null;
  }
}
