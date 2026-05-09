chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'start_translation') {
    startCapture(sendResponse);
    return true; 
  } else if (request.action === 'stop_translation') {
    stopCapture();
    sendResponse({ success: true });
  } else if (request.action === 'process_audio_chunk') {
    const blob = new Blob([new Uint8Array(request.payload)], { type: 'audio/webm' });
    processAudioChunk(blob);
  }
});

async function startCapture(sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      sendResponse({ success: false, error: 'No active tab found' });
      return;
    }

    // 1. Content Script에 초기화 메시지 전송
    await chrome.tabs.sendMessage(tab.id, { action: 'init_subtitle' }).catch(err => {
      console.warn('Content script not ready, injecting...', err);
      // 필요한 경우 여기서 스크립트 주입 로직 추가 가능
    });

    // 2. Offscreen Document 생성
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Capturing tab audio for translation'
    }).catch(() => {});

    // 3. streamId 가져오기
    chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (streamId) => {
      if (!streamId) {
        sendResponse({ success: false, error: 'Failed to get stream ID' });
        return;
      }
      
      chrome.runtime.sendMessage({
        target: 'offscreen',
        action: 'start_capture',
        streamId: streamId
      });
      
      chrome.storage.local.set({ isRunning: true, activeTabId: tab.id });
      sendResponse({ success: true });
    });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function stopCapture() {
  const { activeTabId } = await chrome.storage.local.get('activeTabId');
  
  chrome.runtime.sendMessage({ target: 'offscreen', action: 'stop_capture' });
  chrome.storage.local.set({ isRunning: false });
  
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, { action: 'clear_subtitle' }).catch(() => {});
  }

  chrome.offscreen.closeDocument().catch(() => {});
}

async function processAudioChunk(blob) {
  const settings = await chrome.storage.local.get(['papagoId', 'papagoSecret', 'activeTabId']);
  if (!settings.papagoId || !settings.papagoSecret) return;

  console.log('Processing audio chunk...');
  const recognizedText = await callClovaSTT(blob, settings.papagoId, settings.papagoSecret);
  
  if (recognizedText && recognizedText.trim()) {
    console.log('Recognized:', recognizedText);
    const translatedText = await callPapagoTranslate(recognizedText, settings.papagoId, settings.papagoSecret);
    
    if (translatedText && settings.activeTabId) {
      console.log('Translated:', translatedText);
      chrome.tabs.sendMessage(settings.activeTabId, { action: 'show_subtitle', text: translatedText }).catch(err => {
        console.error('Failed to send subtitle to tab:', err);
      });
    }
  } else {
    console.log('No speech recognized in this chunk.');
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
