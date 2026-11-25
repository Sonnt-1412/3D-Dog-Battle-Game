# Pawtown

Khám phá **Bản ven suối** cùng chó H’Mông cộc ở góc nhìn thứ ba. Bản làng lấy cảm hứng từ kiến trúc nhà sàn Tày, với rừng tre, bến nước, cầu gỗ và sông suối có cá.

```sh
npm ci
npm run dev
```

Mở [localhost:18080](http://localhost:18080), bấm **Vào bản**.

- **WASD** hoặc phím mũi tên để di chuyển, **Shift** để chạy, **Space** để nhảy.
- Kéo chuột để xoay camera quanh chó và cuộn để đổi khoảng cách.
- **B** để sủa.
- **Esc** để tạm dừng, **R** để về bản xuất phát.
- Trên màn hình cảm ứng, dùng cần di chuyển và kéo trên bản đồ để xoay camera.

Bản đồ nạp địa hình khi di chuyển. Có thể đi qua cầu, lội ở bờ nông hoặc bơi qua lòng sông. Khu xuất phát dùng dữ liệu cao độ vùng Bidoup đã chỉnh cho lối đi và bờ sông. Địa hình xa hơn được tạo từ tọa độ, nên cùng một nơi sẽ hiện lại đúng khi quay về.

Các tài nguyên tải về từ Poly Haven, Tevy và 3DAssets.dev được nén sẵn trong `public/environment/`. `npm run build` kiểm tra và đóng gói chúng. [Nguồn tài nguyên](public/licenses/FOREST_ASSETS.html)

Chạy `npm test` để kiểm tra chuyển động, va chạm, camera và tài nguyên phát hành.
