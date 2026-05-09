(function() {
  let overlay = null;

  function createOverlay() {
    if (document.getElementById('ja-ko-subtitle-overlay')) {
      overlay = document.getElementById('ja-ko-subtitle-overlay');
      return;
    }
    
    overlay = document.createElement('div');
    overlay.id = 'ja-ko-subtitle-overlay';
    overlay.style.cssText = `
      position: fixed !important;
      bottom: 10% !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      background-color: rgba(0, 0, 0, 0.8) !important;
      color: white !important;
      padding: 12px 24px !important;
      border-radius: 8px !important;
      font-size: 22px !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      text-align: center !important;
      min-width: 250px !important;
      max-width: 80% !important;
      line-height: 1.5 !important;
      font-family: sans-serif !important;
      display: none;
      box-shadow: 0 4px 15px rgba(0,0,0,0.5) !important;
    `;
    overlay.innerText = 'Waiting for subtitles...';
    document.body.appendChild(overlay);
    console.log('Subtitle overlay created');
  }

  function showSubtitle(text) {
    if (!overlay) createOverlay();
    overlay.innerText = text;
    overlay.style.display = 'block';
  }

  function hideSubtitle() {
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received in content script:', request.action);
    if (request.action === 'init_subtitle') {
      createOverlay();
      showSubtitle('Translator active. Waiting for audio...');
      sendResponse({ success: true });
    } else if (request.action === 'show_subtitle') {
      showSubtitle(request.text);
      sendResponse({ success: true });
    } else if (request.action === 'clear_subtitle') {
      hideSubtitle();
      sendResponse({ success: true });
    }
    return true;
  });

  // 초기 로드 시 생성 시도 (이미 실행 중인 경우를 위해)
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    createOverlay();
  } else {
    document.addEventListener('DOMContentLoaded', createOverlay);
  }
})();
