# Deploy STEM Studio ke Hostinger

Target: `https://course.ypi-baitussalam.or.id`, pada paket Web/Cloud dengan Node.js yang sudah dimiliki. Website utama tetap menjadi aplikasi terpisah.

## Status source

Source sekarang menjalankan **Next.js pada Node.js**, memakai MariaDB dan login email/password sendiri. `npm run build` membuat build Next.js produksi; `npm start` menjalankan server Node. Pool MariaDB dipertahankan per proses. Header identitas Sites/ChatGPT tidak digunakan sebagai login.

GitHub Actions memeriksa tipe, tes unit, build Node, migrasi/query pada MariaDB 10.11 sementara, autentikasi, dan alur HTTP produksi. CI tidak memakai server/password Hostinger dan belum menjadi job deployment. Tampilan Site lama tidak berubah sampai ada deployment ke hosting yang dituju.

Pada **7 Oktober 2026**, koneksi nyata MariaDB Hostinger berhasil, dengan TLS aktif dan verifikasi sertifikat/hostname. Database khusus course dipastikan kosong, kemudian dua migrasi berhasil diterapkan; jumlah tabel terverifikasi 23. Owner, deployment Node.js, DNS/SSL aplikasi, dan CI/CD deployment belum selesai. Tidak ada impor otomatis peserta/progres dari D1; perubahan penyedia login menghasilkan ID akun baru. Bila ingin memindahkan data Site lama, lakukan pemetaan akun dan uji import terpisah dahulu.

## 1. Periksa database dan buat tabel

Pada komputer operator, isi `.env.local` sesuai [panduan MariaDB](Configure-MariaDB.md). Masukkan password hanya pada file lokal yang diabaikan Git atau environment Hostinger. Jalankan dari root source repository, memakai Node.js 22.13 atau lebih baru:

```sh
npm ci --include=dev --include=optional
npm run db:check
npm run db:migrate:mariadb -- --apply
```

`db:check` hanya membaca koneksi/TLS/versi. Jalankan migrasi hanya setelah koneksi benar, pada database khusus yang kosong atau sudah memiliki riwayat migrasi STEM. Instalasi baru membuat 22 tabel aplikasi dan satu tabel riwayat. Migrasi kedua menambahkan kredensial, sesi, dan pembatasan login; migrasi pertama tidak diubah. Database hosting harus MariaDB 10.11 atau lebih baru.

Akses dari komputer lokal memerlukan allowlist IP operator pada Remote MySQL. Konfirmasikan hostname dan TLS Hostinger; jangan mematikan pemeriksaan sertifikat untuk mengatasi mismatch IP/hostname. Jika hosting memiliki database dengan data lain, pilih database terpisah atau tinjau backup sebelum migrasi.

## 2. Buat owner secara eksplisit

Setelah tabel tersedia, jalankan pada komputer operator dengan koneksi database yang benar:

```sh
npm run auth:admin -- create-owner
```

Masukkan email, nama pengelola, dan password melalui prompt terminal. Password disembunyikan saat diketik dan tidak menjadi argumen shell. Gunakan frasa unik 15–128 karakter dan simpan di password manager. Owner kedua ditolak. Tidak ada endpoint HTTP yang membuat owner; pengunjung pertama tidak memperoleh akses admin. Perintah tidak perlu dijalankan setiap redeploy.

Pemulihan password, setelah operator memverifikasi pemilik akun secara terpisah:

```sh
npm run auth:admin -- reset-password
```

Reset mencabut seluruh sesi akun. Jangan mengirim password ke chat, GitHub, issue, atau screenshot. Bila menjalankan CLI melalui SSH hosting, environment koneksi juga harus tersedia untuk proses terminal tersebut; environment aplikasi belum tentu otomatis masuk ke shell SSH.

## 3. Hubungkan aplikasi Node.js di hPanel

1. Buka Websites → Create/Add Website → Web App/Node.js → Import Git Repository.
2. Hubungkan GitHub dan pilih `andreseptian07/stem-course`, branch `main` yang telah lolos CI.
3. Pilih preset **Next.js**, bukan static frontend. Root repository GitHub sudah merupakan root source, jadi gunakan **`.`**, bukan `platform`.
4. Gunakan Node.js **22.x** (minimal 22.13), install `npm ci --include=dev --include=optional`, build `npm run build`, dan start `npm start` bila kolom tersebut ditampilkan. Output Next.js adalah `.next`; aplikasi membutuhkan server Node dan dependencies runtime, bukan hanya folder `public`.
5. Hostinger menyediakan port proses; `next start` membaca `PORT`. Jangan mengunci port development 5173 untuk produksi atau memakai Wrangler/Vinext.

Nama menu dapat berbeda. [Panduan resmi Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/) mencantumkan dukungan Next.js backend, Node.js 22, integrasi GitHub, dan pengaturan environment.

Lokasi yang ditentukan pengguna, `/home/USER/domains/DOMAIN/public_html/course`, merupakan folder di hosting website utama. Menyalin source ke folder itu saja tidak menyalakan server Next.js. Gunakan deployment **Aplikasi Web Node.js** dan domain yang diarahkan ke aplikasi tersebut; lokasi checkout/proses mengikuti konfigurasi layanan Node.js Hostinger. Simpan kredensial di environment aplikasi, bukan file yang dapat dilayani sebagai aset publik.

Pada pemeriksaan hPanel 7 Oktober 2026, onboarding Node.js awalnya menolak `course.ypi-baitussalam.or.id` karena subdomain sudah aktif. Pengguna menonaktifkan subdomain lama sendiri, lalu pengulangan onboarding menerima subdomain course dan mencapai pilihan impor GitHub. Domain sementara tidak digunakan. Koneksi GitHub, pengaturan build/environment, deployment, dan pengujian login produksi masih harus diselesaikan.

## 4. Isi environment aplikasi

Gunakan Environment Variables di hPanel. File `.env.local` tidak ikut GitHub, sehingga konfigurasi lokal tidak otomatis tersedia di hosting. Ganti placeholder `HOSTINGER_MYSQL_HOST`, `HOSTINGER_MYSQL_USER`, dan `HOSTINGER_MYSQL_DATABASE` dengan nilai hPanel atau file lokal; jangan menyimpan detail koneksi asli di repository publik.

```dotenv
APP_URL=https://course.ypi-baitussalam.or.id
AUTH_REGISTRATION_ENABLED=false
AUTH_ALLOW_LOCAL_HTTP=false
DB_HOST=HOSTINGER_MYSQL_HOST
DB_PORT=3306
DB_USER=HOSTINGER_MYSQL_USER
DB_NAME=HOSTINGER_MYSQL_DATABASE
DB_PASSWORD=ISI_SENDIRI_DI_HPANEL
DB_POOL_LIMIT=3
DB_SSL_MODE=required
JUDGE0_ENABLED=false
NEXT_TELEMETRY_DISABLED=1
```

Masukkan setiap nilai hPanel tanpa kutip pembungkus. Hostname database yang disediakan pengguna sudah lolos pemeriksaan koneksi/TLS dari komputer operator tanpa CA tambahan. Uji kembali dari runtime Node.js hosting. Isi `DB_SSL_CA_BASE64` jika operator database menyediakan CA khusus; jangan mengganti verifikasi TLS dengan koneksi tanpa enkripsi.

`APP_URL` adalah origin HTTPS persis yang dibuka browser, tanpa path. Bila pertama kali menguji dengan domain sementara HTTPS Hostinger, gunakan origin sementara tersebut sebagai `APP_URL`, lalu ganti dan redeploy setelah domain course aktif. Origin POST dipatok ke konfigurasi ini; domain sementara tidak dapat menulis jika APP_URL masih domain course. Jangan mengubahnya menjadi wildcard.

Pendaftaran awal ditutup. Setelah owner berhasil masuk, buka pendaftaran dengan `AUTH_REGISTRATION_ENABLED=true` dan redeploy/restart sesuai pengaturan hPanel. Peserta baru tetap menunggu persetujuan pada `/access`. Belum ada verifikasi email otomatis, jadi pengelola perlu memastikan identitas peserta sebelum menyetujui. Email pendaftar belum membuktikan kepemilikan alamat email.

## 5. Domain dan SSL

Deploy dan periksa log serta URL sementara dahulu. Hubungkan `course.ypi-baitussalam.or.id` ke aplikasi Node. Isi record DNS `course` sesuai nilai yang diberikan hPanel; jangan menebak IP atau mengganti nameserver/record website utama. Jika `course` sudah memiliki record, tinjau tujuannya dahulu.

Pastikan HTTPS/SSL aktif dan `APP_URL` sesuai domain. Cookie sesi memakai prefix `__Host-`, Secure, HttpOnly, SameSite=Lax, Path=/ dan tanpa Domain. Cookie platform tidak dibagikan ke website utama. HTTP localhost hanya tersedia untuk `next dev` dengan `AUTH_ALLOW_LOCAL_HTTP=true`; mode produksi menolak konfigurasi tersebut.

## 6. Uji nyata sebelum mengundang peserta

- Owner masuk di `/login`, melihat `/access`, dan dapat mengelola course.
- Akun peserta kedua mendaftar, masuk ke `/access` dengan status pending, dan tidak dapat membuka API belajar sebelum persetujuan.
- Setelah disetujui, peserta dapat mendaftar course, menyimpan profil/progres, dan mengikuti kelas yang disetujui.
- Peserta A tidak melihat pekerjaan/feedback pribadi peserta B; mentor hanya mengakses kelas yang ditugaskan.
- Penangguhan menolak akses belajar pada permintaan berikutnya; peserta masih dapat melihat status akun dan keluar.
- Ganti password mencabut semua sesi; logout mencabut sesi saat ini. Membuka `/logout` saja belum mengakhiri sesi: tombol Keluar mengirim POST.
- Kuota kuis, syarat materi, revisi progres, review tugas, dan jadwal bekerja. Data bertahan setelah redeploy/restart karena tersimpan di MariaDB.
- Latihan browser Python/JavaScript diuji pada HTTPS. Judge0 tetap nonaktif; hasil browser tidak meluluskan coding wajib. Jadikan latihan contoh opsional melalui admin jika ingin menguji seluruh perjalanan course sebelum sandbox tersedia.
- Uji backup dan restore database pada salinan terpisah. Rollback source tidak otomatis membatalkan migrasi.

## CI/CD

Alur pengembangan berikutnya: branch fitur → pull request → CI/build → merge main → deployment Hostinger. Gunakan hasil CI sebagai syarat merge jika aturan branch tersedia pada paket repository Anda.

Integrasi Hostinger yang merespons push **tidak otomatis menunggu GitHub Actions**. Pastikan branch deployment menerima perubahan yang sudah lolos CI. Untuk rilis awal gunakan deployment manual/terawasi. Setelah pengujian hosting berhasil, aktifkan deploy otomatis melalui integrasi Hostinger jika tersedia. Agent belum mengaktifkan integrasi atau mengubah konfigurasi hPanel.

Perubahan terlihat setelah build dan deployment berhasil, bukan setiap kali file diketik. Untuk preview cepat gunakan `npm run dev` lokal, `APP_URL=http://localhost:5173`, dan `AUTH_ALLOW_LOCAL_HTTP=true` pada environment lokal. Koneksi lokal tetap memakai database pengembangan terpisah; jangan menjalankan fixture tes pada hosting.

## Batas tahap ini

Tidak memerlukan penyedia login berbayar atau VPS untuk platform web. Autentikasi memiliki budget awal 20 pendaftaran per jam secara global, 3 per email per jam, 100 percobaan login per 15 menit secara global, dan 10 per email per 15 menit. Budget tersimpan di MariaDB dan berlaku lintas proses; cocok untuk pilot kecil, perlu penyesuaian dan proteksi bot sebelum trafik besar.

Belum ada email verifikasi/reset otomatis, MFA, pentest independen, atau monitoring/backup operasional terkelola. Pemulihan awal melalui operator CLI. Judge0 merupakan layanan terpisah dan opsional; lihat [panduan Judge0 VPS](Install-Judge0-VPS.md).
