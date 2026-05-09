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

    // 오디오를 다시 스피커로 출력 (사용자가 들을 수 있게)
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(audioContext.destination);

    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    
    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        // Blob을 ArrayBuffer로 변환하여 background로 전송
        const buffer = await event.data.arrayBuffer();
        chrome.runtime.sendMessage({
          action: 'process_audio_chunk',
          payload: Array.from(new Uint8Array(buffer))
        });
      }
    };

    mediaRecorder.start(3000);
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
