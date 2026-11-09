# TopTop Live Gateway

Gateway tự host cho bình luận TikTok Live, có cách kết nối giống tik.tools. Bạn mở live trên Chrome, extension đọc bình luận đang hiện trên trang, gateway phát lại qua WebSocket cho các ứng dụng khác.

```
Chrome (tab live + extension) ──► gateway ──WebSocket──► overlay, game, dashboard...
```

Không dùng dịch vụ bên thứ ba, không giả lập client TikTok, không cần mật khẩu hay cookie.

## Cài đặt
Cần Node.js 22 trở lên.

```bash
npm install
```

Chép `.env.example` thành `.env` rồi đặt `GATEWAY_API_KEY`. Có thể tạo key ngẫu nhiên bằng:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Cài extension (một lần): vào `chrome://extensions`, bật **Developer mode**, bấm **Load unpacked**, chọn thư mục `extension/`.

## Chạy
1. `npm start`
2. Mở live trên Chrome, ví dụ `https://www.tiktok.com/@ten_kenh/live`. Nếu tab đã mở từ trước thì bấm F5.
3. Ứng dụng của bạn kết nối tới `ws://localhost:8787?uniqueId=ten_kenh&apiKey=<key>`.

Kiểm tra: `http://localhost:8787/health` cho biết kênh nào đang có dữ liệu. Thử không cần TikTok bằng cách mở `http://localhost:8787/mock/live.html` trên Chrome và kết nối với `uniqueId=mock`.

## Dữ liệu nhận được
Mỗi tin WebSocket là JSON dạng `{ event, data }`.

```json
{ "event": "connected", "data": { "uniqueId": "ten_kenh" } }
```

```json
{
  "event": "chat",
  "data": {
    "msgId": "1",
    "roomId": "ten_kenh",
    "comment": "chốt A12",
    "timestamp": 1794249024991,
    "user": { "uniqueId": "Lan Nguyễn", "nickname": "Lan Nguyễn", "avatarUrl": "https://..." }
  }
}
```

Sai key sẽ nhận HTTP 401, thiếu `uniqueId` nhận HTTP 400.

## Dùng thay tik.tools
Trong ứng dụng đang dùng tik.tools, đổi `wss://api.tik.tools` thành `ws://localhost:8787` và dùng key của gateway. Nếu ứng dụng cũng chạy cổng 8787 thì đặt `PORT` khác, đồng thời sửa `extension/manifest.json` và `extension/background.js`.

## Giới hạn
- Phải giữ một tab live hiển thị trên Chrome cho mỗi kênh. Tab ẩn hoặc thu nhỏ có thể bị Chrome làm chậm.
- Mỗi kênh chỉ mở một tab, mở hai tab sẽ bị trùng tin. Nhiều kênh khác nhau thì mở nhiều tab.
- Hiện chỉ có sự kiện `chat`. Chưa có `gift`, `like`, `member`.
- Trang chỉ hiển thị tên nên `user.uniqueId` chính là tên hiển thị, hai người trùng tên sẽ bị coi là một.
- Gateway chỉ nhận bình luận mới, không phát lại tin cũ cho client vào sau.
- Khi TikTok đổi giao diện, sửa `SEL` trong `extension/content.js` rồi tải lại extension.

Đây là đọc dữ liệu công khai hiển thị trên trang, không phải API chính thức. Hãy tuân thủ điều khoản của TikTok.
