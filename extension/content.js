// Chạy trong tab TikTok Live bạn tự mở: đọc bình luận đang hiển thị trên trang và gửi cho background.js.
// Sửa selector ở đây nếu TikTok đổi giao diện.
const SEL = {
  message: '[data-e2e="chat-message"]',
  owner: '[data-e2e="message-owner-name"]',
  skip: '[data-e2e="more-action-button"]',
};
const FLUSH_MS = 300;

const seen = new WeakSet();
let queue = [];

function currentRoom() {
  if (location.hostname === 'localhost') return 'mock';
  const m = location.pathname.match(/^\/@([^/]+)\/live/);
  return m ? m[1] : null;
}

// Nội dung bình luận nằm sau tên và các huy hiệu cấp ("8", "No. 1"): lấy khối chữ cuối cùng.
function commentText(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let last = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const parent = n.parentElement;
    if (parent.closest(SEL.owner) || parent.closest(SEL.skip)) continue;
    last = parent;
  }
  if (!last) return '';
  const clone = last.cloneNode(true);
  clone.querySelectorAll('img').forEach((img) => img.replaceWith(img.alt || ''));
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

function parse(el) {
  if (seen.has(el) || !currentRoom()) return;
  seen.add(el);
  const nameEl = el.querySelector(SEL.owner);
  const text = commentText(el);
  if (!text) return;
  const avatar = el.querySelector('img');
  queue.push({ user: nameEl ? nameEl.textContent.trim() : '', text, avatar: avatar ? avatar.src : '', ts: Date.now() });
}

function scan(node) {
  if (node.nodeType !== 1) return;
  if (node.matches(SEL.message)) parse(node);
  else node.querySelectorAll(SEL.message).forEach(parse);
}

const timer = setInterval(() => {
  const room = currentRoom();
  if (!queue.length || !room) return;
  const messages = queue;
  queue = [];
  try {
    chrome.runtime.sendMessage({ room, messages }).catch(() => {});
  } catch (e) {
    clearInterval(timer); // extension vừa được tải lại: tab này cần F5
  }
}, FLUSH_MS);

scan(document.body);
new MutationObserver((muts) => {
  for (const m of muts) m.addedNodes.forEach(scan);
}).observe(document.body, { childList: true, subtree: true });
