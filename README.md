# Pawtown — Sau nửa đêm

Game sinh tồn 3D trên trình duyệt với **10 chó chơi được**. Khám phá một thị trấn
mưa đêm, tìm thức ăn và trở về mái hiên. Trong 8 cư dân NPC có **3 người gác**:
họ chú ý khi bạn đến gần hoặc gây tiếng động, truy đuổi và có thể ném đá hoặc
xô bạn. Những cư dân còn lại có thể chỉ đường và đưa lời khuyên.

Đòn đánh có động tác chuẩn bị và vòng báo trên đất. Rời vòng đó, né quanh vật
cản, nhảy đúng lúc hoặc chạy khỏi tầm nhìn. Bản đồ đánh dấu người gác và các
vùng trú màu xanh. Trong vùng trú, truy đuổi dừng lại và **E** hồi thể lực.
Không có hình ảnh máu hay thương tích trực diện.

Bản hiện tại là mô phỏng một người chơi, không cần database, tài khoản hay API
key. NPC được điều khiển cục bộ; chưa có kết nối người chơi trực tuyến.

## Chơi

1. Chọn Phú Quốc, H’Mông cộc, Corgi, Shiba, Golden, Husky, Labrador, Pug,
   Chihuahua hoặc Bắc Hà, rồi bấm **Bước vào đêm**.
2. Thu thập **3 phần thức ăn** và mang về một trong hai vùng trú.
3. Quan sát người gác. Tiếng sủa và chạy nhanh làm bạn dễ bị phát hiện hơn.

| Điều khiển | Hành động |
| --- | --- |
| WASD / phím mũi tên | Di chuyển theo hướng camera |
| Shift | Chạy nhanh, tiêu hao năng lượng |
| Space | Nhảy; có thể tránh đòn thấp nếu đúng nhịp |
| E | Nghỉ trong vùng trú / nghe cư dân thân thiện |
| B | Sủa; có thể thu hút người gác ở gần |
| Kéo chuột | Xoay camera |
| Cuộn chuột | Zoom camera |
| Esc | Tạm dừng / tiếp tục |

Có 3 mức thể lực, khoảng miễn sát thương ngắn sau khi trúng đòn và nút thử lại
khi bị dồn vào góc. Thử lại đưa chó về mái hiên, hồi thể lực và xóa các đòn ném
cũ. Có thể nghỉ lại sau 8 giây. Màn hình cảnh báo giúp phân biệt đang bị chú ý,
bị truy đuổi và chuẩn bị trúng đòn.

Điện thoại có joystick và các nút chạy, nhảy, sủa, tương tác. Menu tạm dừng cho
phép đổi chó. Lựa chọn được nhớ bằng localStorage nếu trình duyệt cho phép;
URL `?dog=corgi` mở Corgi được chọn sẵn.

## Docker

```sh
docker build -t dog-motion-lab:latest .
docker run --rm --name dog-motion-lab -p 127.0.0.1:18081:8080 dog-motion-lab:latest
```

Mở **http://localhost:18081**. Image chạy bằng user không phải root, cổng trong
container là 8080, health check là `/healthz`. Nếu container cùng tên đang chạy,
dừng nó trước bằng `docker stop dog-motion-lab`.

Nếu có Docker Compose, chạy `docker compose up --build -d`. Cấu hình Compose dùng
filesystem chỉ đọc. Trên Mac dùng Colima, chạy `colima start` nếu Docker chưa bật.

## Chạy trực tiếp

Node.js 24 LTS hoặc Node.js 22.12+:

```sh
npm ci
npm test
npm run build
npm start
```

Mở **http://localhost:18080**. Sau khi sửa `web/`, build lại rồi tải lại trang.
Biến `PORT` đổi cổng cho server chạy trực tiếp.

## Vercel

Import repository GitHub, dùng Root Directory mặc định và framework **Other**:

- Build Command: `npm run build`
- Output Directory: `dist`

`vercel.json` cung cấp cấu hình build và cache. Vercel phục vụ game tĩnh từ `dist/`;
Docker đóng gói cùng game đó để chạy local hoặc tự host. Không cần biến môi trường.

## Cấu trúc

- `web/roster.mjs`: 10 nhân vật chơi được, mô tả và thông số gameplay.
- `web/main.mjs`: màn chọn chó, HUD, joystick, bản đồ và hội thoại.
- `web/game/engine.mjs`: mô phỏng 60 Hz, camera, input, đòn ném và vòng sinh tồn.
- `web/game/animation.mjs`: blend Idle/Walk/Trot/Gallop, đồng bộ pha và cử chỉ.
- `web/game/threats.mjs`: phát hiện, truy đuổi, chuẩn bị đòn và tìm kiếm mục tiêu.
- `web/game/weather.mjs`: mưa và texture nền tạo bằng code.
- `web/game/physics.mjs`: chuyển động, va chạm, năng lượng và khoảng cách tương tác.
- `web/game/world.mjs`: môi trường 3D tạo bằng hình học, không tải cảnh từ dịch vụ ngoài.
- `web/game/residents.mjs`: cư dân, tuần tra, cử động và cảnh báo đòn đánh.
- `web/game/assets.mjs`: tải/clone chó có skeleton và quản lý cache tài nguyên.
- `public/`: chỉ 10 model dành cho game, metadata và thông báo nguồn tài sản.
- `scripts/`: build, kiểm tra, tạo model web và các test Node.
- `server.mjs`, `Dockerfile`, `compose.yaml`, `vercel.json`: chạy và triển khai.

## Model và dữ liệu cũ

10 model web sử dụng Meshopt, hoạt ảnh đã tối ưu và texture WebP 1024px; tổng
khoảng **34 MB**, cả bản build khoảng **35 MB**. Game tải chó đang chọn và hai
chó đi dạo, thay vì tải cả bộ sưu tập. Gait được blend theo tốc độ và chiều cao,
cùng pha bước chân; các clip không dùng được tắt để giảm việc cập nhật skeleton.
Mô phỏng chạy ở 60 Hz, còn render và animation theo nhịp màn hình. HUD cập nhật
khoảng 12 lần/giây để giảm tạo object và thao tác DOM. Three.js và decoder đều được phục vụ từ
chính ứng dụng.

Bộ 294 model gốc và 23 model tùy chỉnh của ứng dụng desktop vẫn giữ trên máy
trong `assets/`; `Textures/` giữ đầu vào authoring. Những đầu vào này không nằm
trong Git và không cần để build/chạy game. Các bản web không dùng được chuyển
sang `artifacts/web-model-archive/` cục bộ và không đưa vào bản triển khai.

Ứng dụng Panda3D và các công cụ authoring Python cũ được giữ lại. Chúng cần bộ
model gốc để chạy; một checkout Git mới chỉ có 10 model dùng cho game web.

Để tạo lại model web trên máy có đầu vào gốc:

```sh
npm run models:prepare
node scripts/check-web-models.mjs
npm run build
```

Thông báo nguồn và điều kiện sử dụng model được giữ trong `public/licenses/`.

## Kiểm tra

```sh
npm test
npm run build
node scripts/check-web-models.mjs
```

Các test Node kiểm tra roster, chuyển động, va chạm, năng lượng, blend animation,
phát hiện/truy đuổi, khóa mục tiêu, nơi trú, đòn ném và server HTTP. Bộ kiểm tra model
giải nén cả 10 file và xác nhận skeleton 80 khớp, các clip di chuyển và dữ liệu mesh.

Trên máy authoring vẫn có thể chạy test Python cho dữ liệu gốc:

```sh
.venv/bin/python -B -m unittest discover -s tests -v
```
