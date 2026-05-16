chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'start_translation') {
    handleStart(request.streamId, request.tabId, sendResponse);
    return true; 
  } else if (request.action === 'stop_translation') {
    handleStop();
    sendResponse({ success: true });
  } else if (request.action === 'process_audio_chunk') {
    const blob = new Blob([new Uint8Array(request.payload)], { type: 'audio/webm' });
    processAudioChunk(blob);
  }
});

async function handleStart(streamId, tabId, sendResponse) {
  try {
    // 1. Content Script 강제 주입
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content_script.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ['overlay.css']
      });
    } catch (e) {
      console.log('Script injection skipped:', e);
    }

    // 2. 초기화 메시지
    await chrome.tabs.sendMessage(tabId, { action: 'init_subtitle' }).catch(() => {});

    // 3. Offscreen Document
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Capturing tab audio for translation'
    }).catch(() => {});

    // 4. Offscreen에 캡처 시작 명령 전송
    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'start_capture',
      streamId: streamId
    });
    
    chrome.storage.local.set({ isRunning: true, activeTabId: tabId });
    sendResponse({ success: true });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleStop() {
  const { activeTabId } = await chrome.storage.local.get('activeTabId');
  chrome.runtime.sendMessage({ target: 'offscreen', action: 'stop_capture' });
  chrome.storage.local.set({ isRunning: false });
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, { action: 'clear_subtitle' }).catch(() => {});
  }
  chrome.offscreen.closeDocument().catch(() => {});
}

async function processAudioChunk(blob) {
  const settings = await chrome.storage.local.get(['papagoId', 'papagoSecret', 'clovaSecret', 'activeTabId']);
  if (!settings.clovaSecret || !settings.activeTabId) return;

  const recognizedText = await callClovaSTT(blob, settings.clovaSecret);
  
  if (recognizedText && recognizedText.trim()) {
    const translatedText = await callPapagoTranslate(recognizedText, settings.papagoId, settings.papagoSecret);
    if (translatedText) {
      chrome.tabs.sendMessage(settings.activeTabId, { action: 'show_subtitle', text: translatedText }).catch(() => {});
    }
  }
}

async function callClovaSTT(blob, secretKey) {
  try {
    const response = await fetch('https://naveropenapi.apigw.ntruss.com/recog/v1/stt?lang=jpn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-NCP-APIGW-API-KEY': secretKey
      },
      body: blob
    });
    const data = await response.json();
    return data.text;
  } catch (err) {
    console.error('STT API Error:', err);
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
    console.error('Papago API Error:', err);
    return null;
  }
}
