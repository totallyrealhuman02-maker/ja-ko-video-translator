let mediaRecorder;

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target !== 'offscreen') return;

  if (message.action === 'start_capture') {
    startCapture(message.streamId);
  } else if (message.action === 'stop_capture') {
    stopCapture();
  }
});

async function startCapture(streamId) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(audioContext.destination);

    // 오디오 형식 최적화 시도
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    
    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        const buffer = await event.data.arrayBuffer();
        chrome.runtime.sendMessage({
          action: 'process_audio_chunk',
          payload: Array.from(new Uint8Array(buffer))
        });
      }
    };

    // 5초 주기로 전송하여 문맥 파악 향상
    mediaRecorder.start(5000);
  } catch (err) {
    console.error('Offscreen capture error:', err);
  }
}

function stopCapture() {
  if (mediaRecorder) {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
}
