let audioContext;
let mediaStreamSource;
let processor;
let mediaRecorder;
let audioChunks = [];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'start_translation') {
    startCapture(sendResponse);
    return true; // 비동기 응답 유지
  } else if (request.action === 'stop_translation') {
    stopCapture();
    sendResponse({ success: true });
  }
});

async function startCapture(sendResponse) {
  try {
    // 탭 오디오 캡처
    chrome.tabCapture.capture({ audio: true, video: false }, async (stream) => {
      if (!stream) {
        sendResponse({ success: false, error: '스트림을 가져올 수 없습니다.' });
        return;
      }

      // 오디오 컨텍스트 생성
      audioContext = new AudioContext();
      mediaStreamSource = audioContext.createMediaStreamSource(stream);
      
      // 오디오를 다시 스피커로 출력 (사용자가 들을 수 있게)
      mediaStreamSource.connect(audioContext.destination);

      // MediaRecorder를 사용하여 오디오 조각 캡처
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          processAudioChunk(event.data);
        }
      };

      // 3초마다 오디오 조각 생성
      mediaRecorder.start(3000);
      
      chrome.storage.local.set({ isRunning: true });
      sendResponse({ success: true });
    });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

function stopCapture() {
  if (mediaRecorder) mediaRecorder.stop();
  if (audioContext) audioContext.close();
  chrome.storage.local.set({ isRunning: false });
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'clear_subtitle' });
    }
  });
}

async function processAudioChunk(blob) {
  const settings = await chrome.storage.local.get(['papagoId', 'papagoSecret', 'clovaSecret']);
  if (!settings.papagoId || !settings.papagoSecret) return;

  // 1. CLOVA Speech (STT) 호출
  const recognizedText = await callClovaSTT(blob, settings.papagoId, settings.papagoSecret);
  
  if (recognizedText && recognizedText.trim()) {
    // 2. Papago 번역 호출
    const translatedText = await callPapagoTranslate(recognizedText, settings.papagoId, settings.papagoSecret);
    
    if (translatedText) {
      // 3. Content Script로 자막 전달
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
    // CSR API 엔드포인트: https://naveropenapi.apigw.ntruss.com/recog/v1/stt?lang=jpn
    // 여기서는 Papago와 동일한 API Gateway를 사용하거나 Clova 전용 게이트웨이 사용
    // CSR API (Short Text Recognition)
    // Client ID/Secret을 사용하는 방식과 Secret Key를 사용하는 방식이 서비스마다 다를 수 있음
    // 여기서는 Papago와 동일한 Client ID/Secret을 사용하는 구조로 예시 작성
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
