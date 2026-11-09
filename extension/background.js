// Nhận bình luận từ content.js và chuyển về gateway. Đổi cổng ở đây và trong manifest.json nếu đổi PORT.
const INGEST_URL = 'http://localhost:8787/ingest';

chrome.runtime.onMessage.addListener(({ room, messages }) => {
  fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room, messages }),
  }).catch((e) => console.warn('Không gửi được về gateway:', e.message));
});
