(function() {
  // 이미 로드된 경우 중복 실행 방지
  if (window.hasJaKoTranslatorLoaded) return;
  window.hasJaKoTranslatorLoaded = true;

  let overlay = null;

  function createOverlay() {
    overlay = document.getElementById('ja-ko-subtitle-overlay');
    if (overlay) return;
    
    overlay = document.createElement('div');
    overlay.id = 'ja-ko-subtitle-overlay';
    // 스타일을 JS에서 직접 제어하여 우선순위 보장
    Object.assign(overlay.style, {
      position: 'fixed',
      bottom: '10%',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      color: 'white',
      padding: '14px 28px',
      borderRadius: '10px',
      fontSize: '24px',
      zIndex: '2147483647',
      pointerEvents: 'none',
      textAlign: 'center',
      minWidth: '300px',
      maxWidth: '85%',
      lineHeight: '1.4',
      fontFamily: '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
      display: 'none',
      boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
      border: '1px solid rgba(255,255,255,0.1)'
    });
    
    overlay.innerText = 'Waiting for subtitles...';
    document.body.appendChild(overlay);
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
    if (request.action === 'init_subtitle') {
      createOverlay();
      showSubtitle('Translator Ready. Listening...');
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

  // 초기 생성 시도
  createOverlay();
})();
