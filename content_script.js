(function() {
  let overlay = document.getElementById('ja-ko-subtitle-overlay');

  function createOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'ja-ko-subtitle-overlay';
    overlay.innerText = 'Waiting for subtitles...';
    document.body.appendChild(overlay);
  }

  function updateSubtitle(text) {
    if (!overlay) createOverlay();
    overlay.innerText = text;
    overlay.style.display = 'block';
    
    // 일정 시간 후 자막 숨기기 (선택 사항)
    // setTimeout(() => { overlay.style.display = 'none'; }, 5000);
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'show_subtitle') {
      updateSubtitle(request.text);
    } else if (request.action === 'clear_subtitle') {
      if (overlay) overlay.style.display = 'none';
    }
  });
})();
