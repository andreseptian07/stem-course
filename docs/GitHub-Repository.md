# Repository utama platform

Repository yang ditentukan pengguna: [andreseptian07/stem-course](https://github.com/andreseptian07/stem-course).

Remote `origin` pada checkout lokal ditujukan ke repository tersebut. Branch `main` menggunakan `origin` sebagai tujuan push utama. Remote `github` masih menunjuk repository awal `and0789/stem-studio` sebagai referensi; tidak menjadi tujuan unggahan berikutnya.

Login GitHub CLI sudah selesai melalui device authorization sebagai `andreseptian07`; akun tersebut memiliki izin admin pada repository baru. Password GitHub tidak dimasukkan di chat atau source. Remote HTTPS digunakan untuk mengikuti autentikasi CLI, karena SSH key sebelumnya dikenali sebagai akun `and0789`.

Alur unggahan dan verifikasi:

1. Pastikan akun aktif GitHub CLI tetap `andreseptian07` dan memiliki izin menulis ke repository.
2. Gunakan remote HTTPS ke repository yang sama, dengan credential helper GitHub CLI pada checkout ini, karena SSH key sebelumnya tetap milik `and0789`.
3. Unggah `main` tanpa force push. Bila repository sudah memperoleh commit lain, fetch dan tinjau dahulu; jangan menimpa riwayat.
4. Periksa GitHub Actions: tes tipe/unit dan service MariaDB sementara. Workflow tidak mengakses database Hostinger.
5. Koneksi deployment Hostinger baru dilakukan setelah runtime Node.js, autentikasi dan query aplikasi selesai dipindahkan.

Jangan commit `.env.local`, `.dev.vars`, password, atau metadata koneksi IDE. CI hanya memakai kredensial untuk database CI sementara.
