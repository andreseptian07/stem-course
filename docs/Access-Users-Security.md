# Akses pengguna dan keamanan STEM Studio

Runtime Node memakai login email/password sendiri. Tidak memerlukan akun ChatGPT atau undangan viewer Sites. Katalog publik hanya memberikan ringkasan; akun belajar tetap membutuhkan persetujuan pengelola.

## Alur kelas percobaan

1. Operator menyiapkan MariaDB dan membuat owner dengan `npm run auth:admin -- create-owner`. Detail ada di [panduan Hostinger](Deploy-Hostinger.md). Owner ditentukan melalui terminal operator, bukan pendaftar publik pertama.
2. Super Admin masuk di `/login`; buka **Kelola akses → Pendaftaran siswa → Buka pendaftaran siswa**. Pilihan ini tersimpan di database dan mengutamakan nilai awal environment.
3. Siswa membuat akun di `/register`, lalu masuk. Akun baru berstatus **Menunggu persetujuan** pada `/access`; API belajar ditolak sampai persetujuan. Course yang dipilih saat pendaftaran disimpan tanpa membuka materi. Tutor diundang oleh Super Admin melalui tautan aktivasi, bukan memilih peran saat mendaftar.
4. Owner membuka **Kelola akses**, menyetujui akun dengan alasan. Peserta memuat ulang status, lalu membuka dashboard.
5. Owner menugaskan mentor dan menyetujui peserta per kelas. Persetujuan akun dan keanggotaan kelas tetap terpisah.
6. Uji dua akun nyata di hosting untuk memastikan privasi tugas/feedback, progres wajib, review, dan penangguhan. Fixture CI tidak menggantikan pengujian DNS, TLS, cookie browser dan jaringan Hostinger.

Alamat email belum diverifikasi melalui email otomatis. Pengelola perlu memverifikasi identitas peserta secara terpisah sebelum persetujuan; pendaftaran tidak membuktikan kepemilikan alamat email. Belum ada klaim email terverifikasi pada profil.

## Peran dan pembatasan

| Operasi | Pemilik | Peserta aktif | Mentor aktif |
| --- | --- | --- | --- |
| Membuat atau mengubah course | Ya | Tidak | Tidak |
| Menyetujui atau menangguhkan akun | Ya | Tidak | Tidak |
| Mengelola mentor dan peserta kelas | Ya | Tidak | Tidak |
| Membaca materi terbit | Ya | Ya | Ya |
| Membaca diskusi/meeting kelas | Semua kelas | Kelas yang disetujui | Kelas yang ditugaskan |
| Review tugas dan feedback pribadi | Semua kelas | Hanya milik sendiri | Kelas yang ditugaskan |

Tutor memiliki hak mengajar yang diberikan melalui undangan admin dan cakupan penugasan kelas; penugasan mentor lama tetap dikenali. Tutor tidak memiliki akses admin global. Settings.owner menentukan pemilik; role dari isian, header browser atau tabel users tidak memberikan kepemilikan. Owner tidak dapat menangguhkan dirinya sendiri dari aplikasi. Lihat [panduan undangan Tutor](Tutor-Invitations.md) untuk aktivasi dan pencabutan hak.

Penangguhan menolak permintaan API belajar berikutnya meskipun cookie login masih valid; halaman status, logout dan ganti password tetap dapat digunakan. Permintaan yang sedang berjalan dapat selesai dan materi yang sudah diterima browser tidak dapat ditarik kembali. Penangguhan tidak menghapus progres, pekerjaan atau penugasan kelas. Hapus penugasan/keanggotaan secara terpisah bila hak tersebut tidak ingin dipulihkan setelah akun diaktifkan kembali.

## Password dan sesi

Password di-hash menggunakan scrypt, salt acak 16 byte, N=32768, r=8, p=3. Parameter mengikuti alternatif 32 MiB pada [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Password tidak di-trim, dibatasi 15–128 karakter untuk password baru, dan dibandingkan dengan timingSafeEqual. Parameter hash yang tidak dikenal tidak dieksekusi. Maksimal dua operasi hashing bersamaan per proses membatasi RAM/CPU; kapasitas perlu diukur pada paket hosting nyata.

Token sesi acak 256 bit hanya masuk cookie; MariaDB menyimpan hash SHA-256 token, bukan token mentah. Sesi memiliki batas absolut 8 jam dan idle 1 jam; last_seen diperbarui setelah 5 menit aktivitas. Maksimal lima sesi terbaru per akun dipertahankan. Login mengganti sesi browser sebelumnya. Cookie HTTPS memakai `__Host-stem-session`, HttpOnly, Secure, SameSite=Lax, Path=/, tanpa Domain, mengikuti prinsip [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

`/password` membutuhkan password saat ini. Perubahan menaikkan versi kredensial dan mencabut seluruh sesi. Verifikasi versi saat penerbitan sesi menolak login yang memakai password lama jika reset terjadi bersamaan. Logout mencabut sesi dari database, bukan hanya menghapus cookie. GET `/logout` hanya menampilkan konfirmasi; perubahan dilakukan melalui POST agar prefetch/link tidak mengakhiri sesi.

Pemulihan awal dilakukan operator melalui `npm run auth:admin -- reset-password`, dengan prompt password tersembunyi dan pemeriksaan identitas pemohon di luar aplikasi. CLI memerlukan akses server/database operator; tidak ada endpoint reset publik yang menerima email untuk mengganti password tanpa bukti. Belum ada email verifikasi, email reset otomatis atau MFA.

## Proteksi API

- Identitas hanya berasal dari cookie yang tokennya ada di database, masih berlaku, dan cocok dengan versi password. Header `oai-authenticated-user-*` tidak dipercaya. Tidak ada mock login di runtime Node produksi.
- API memeriksa status akun pada setiap permintaan. Peserta melihat status sendiri; daftar pengguna/audit hanya owner. Meeting kelas, tugas dan feedback tetap dibatasi keanggotaan/mentor.
- Origin POST harus sama dengan `APP_URL`, bukan diturunkan dari Host atau X-Forwarded-Host yang dikirim klien. Sec-Fetch-Site cross-site juga ditolak. HTTPS diwajibkan di produksi; HTTP hanya pada localhost development dengan flag eksplisit.
- Payload dibatasi ukuran/jenisnya dan divalidasi strict. Body dibaca sebagai stream dengan batas byte dan waktu, termasuk ketika Content-Length tidak ada; UTF-8 yang tidak valid ditolak. Penulisan memakai prepared statements. Konflik versi ditolak. Audit dan perubahan akses satu transaksi; kuota kuis dan hasil satu transaksi; approval kelas dan enrollment satu transaksi.
- Pembatasan login tersimpan di MariaDB, bukan RAM saja: global 100/15 menit dan per email 10/15 menit; pendaftaran global 20/jam dan per email 3/jam; penggantian password global 100/15 menit dan per email 10/15 menit. Identitas forwarding/IP dari klien tidak dipakai untuk melewati budget ini. Batas pilot dapat menolak sebagian request bersamaan secara konservatif.
- Header nosniff, no-referrer, pembatasan kemampuan browser, dan private/no-store pada akun/API dipertahankan. Respons login tidak mengirim token dalam JSON atau mencatat password/token pada log.

Budget global sesuai tahap pilot kecil, bukan rancangan antispam untuk trafik besar. Tambahkan proteksi bot/rate limiting pada jaringan yang terpercaya dan benchmark sebelum memperluas trafik. Proteksi CSP/frame perlu dirancang dengan memperhatikan video dan runner iframe. Belum ada pentest independen, monitoring keamanan operasional, moderasi lengkap, backup/restore operasional teruji, atau load test produksi. Judge0 belum diaktifkan.

## Verifikasi

`npm run check` memeriksa tipe dan tes unit untuk aturan akses, password, cookie/origin, progres, tugas, kelas dan adapter database. CI MariaDB memeriksa migrasi, owner setup bersamaan, pendaftaran pending, rotasi/expiry sesi, perubahan/reset password, race reset-login, logout dan budget persisten. `npm run test:http` menghidupkan build Node produksi pada database CI terpisah lalu menguji login, cookie, origin, header palsu, approval/suspension, enrollment, logout dan asset runner. Semua fixture dibatasi localhost/database sementara; jangan arahkan ke Hostinger.
