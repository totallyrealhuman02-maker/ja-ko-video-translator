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

    await chrome.tabs.sendMessage(tabId, { action: 'init_subtitle' }).catch(() => {});

    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Capturing tab audio for translation'
    }).catch(() => {});

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
  if (!settings.clovaSecret || !settings.activeTabId || !settings.papagoId) return;

  console.log('Requesting STT...');
  // CSR API는 ID와 Secret(Key)이 모두 필요합니다.
  const recognizedText = await callClovaSTT(blob, settings.papagoId, settings.clovaSecret);
  
  if (recognizedText && recognizedText.trim()) {
    console.log('Recognized Text:', recognizedText);
    const translatedText = await callPapagoTranslate(recognizedText, settings.papagoId, settings.papagoSecret);
    if (translatedText) {
      console.log('Translated Text:', translatedText);
      chrome.tabs.sendMessage(settings.activeTabId, { action: 'show_subtitle', text: translatedText }).catch(() => {});
    }
  } else {
    console.log('No text recognized.');
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
    if (data.error) {
      console.error('STT API Error Response:', data);
      return null;
    }
    return data.text;
  } catch (err) {
    console.error('STT Network/Fetch Error:', err);
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
