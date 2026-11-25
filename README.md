# Pawtown

Khám phá **Đồi thông** cùng chó H’Mông cộc trong trình duyệt, với camera góc nhìn thứ ba.

```sh
npm ci
npm run dev
```

Mở [localhost:18080](http://localhost:18080), bấm **Vào rừng**.

- **WASD** hoặc phím mũi tên để di chuyển, **Shift** để chạy, **Space** để nhảy.
- Kéo chuột để xoay camera quanh chó và cuộn để đổi khoảng cách.
- **B** để sủa.
- **Esc** để tạm dừng, **R** để về điểm đầu.
- Trên màn hình cảm ứng, dùng cần di chuyển và kéo trên bản đồ để xoay camera.

Bản đồ dùng dữ liệu cao độ vùng Bidoup và tài nguyên CC0 từ Poly Haven và Tevy. Các tệp môi trường đã nén nằm trong `public/environment/` và được đóng gói khi chạy `npm run build`. Xem [nguồn tài nguyên](public/licenses/FOREST_ASSETS.html).

Chạy `npm test` để kiểm tra chuyển động, va chạm, camera và tài nguyên phát hành.
