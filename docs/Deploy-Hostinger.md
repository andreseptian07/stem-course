# Migrasi STEM Studio ke Hostinger

Target: `https://course.ypi-baitussalam.or.id`. Pengguna sudah mengonfirmasi paket Web/Cloud Hosting dengan fitur Node.js. Hosting website utama dan platform course harus menjadi aplikasi terpisah.

## Status saat panduan dibuat

- Source tersedia di checkout `platform`; pemeriksaan TypeScript dan unit test disediakan melalui `npm run check`.
- `.github/workflows/ci.yml` menjalankan pemeriksaan pada push dan pull request. Tidak menggunakan secret hosting dan tidak mengubah database.
- Runtime sekarang masih Vinext/Cloudflare Workers, database D1, dan autentikasi Sites. **Belum siap dideploy langsung sebagai aplikasi Node.js di Hostinger.**
- `npm start` sekarang menjalankan Wrangler lokal. Jangan gunakan perintah tersebut untuk server produksi Hostinger.
- CI belum memeriksa build Node produksi atau melakukan CD. Koneksi deployment Hostinger, DNS subdomain, SSL, dan pengujian multiakun belum dilakukan.
- Pengguna sudah membuat database MariaDB. Koneksi Node.js, skema dan migrasi awal disiapkan terpisah; lihat [konfigurasi MariaDB dan tempat mengisi password](Configure-MariaDB.md). Port query bisnis sudah disiapkan dan diuji melalui adapter bersama. Koneksi hosting belum diuji dan API utama belum memakai MariaDB.

## Rancangan migrasi

1. Pertahankan antarmuka TypeScript/React dan fitur course, kuis, kelas, tugas, serta pembatasan akses.
2. Port runtime ke Next.js pada Node.js, termasuk middleware, routing, konfigurasi build, environment dan assets runner browser. Kesesuaian routing Vinext harus diuji; mengganti perintah build saja tidak cukup.
3. Gunakan MariaDB yang sudah dibuat pada Hostinger. Foundation koneksi/skema dan port query bisnis tersedia; integrasi pool MariaDB ke runtime Node masih diperlukan. Database harus persisten dan terpisah dari direktori deployment aplikasi.
4. Ganti Sign in with ChatGPT milik Sites dengan autentikasi web dan sesi yang diverifikasi server. Opsi awal: provider autentikasi terkelola. Terapkan cookie aman, validasi origin/CSRF, pembatasan percobaan login, dan alur pendaftaran peserta.
5. Pertahankan persetujuan akun dan mentor per kelas. Buat owner melalui identitas operator yang ditetapkan, bukan pengunjung publik pertama.
6. Header `oai-authenticated-user-*` dari browser tidak boleh menjadi identitas di Hostinger. Mock login hanya untuk localhost.
7. Port migrasi database secara terpisah. Jangan mengubah migrasi yang sudah diterapkan pada Site. Tentukan apakah data awal dibuat baru atau diekspor dari D1; pemetaan ID akun harus ditangani karena provider login berubah.

Target database sudah ditentukan sebagai MariaDB Hostinger, tetapi integrasi penuh belum diimplementasikan. Provider login masih perlu ditentukan. Jangan menyalin data uji lokal sebagai data peserta nyata.

## Repository dan CI

Repository privat disarankan untuk source platform. Repository tidak boleh berisi `.env`, `.dev.vars`, token API, backup database, atau folder `.wrangler`. `.env.example` hanya berisi contoh tanpa secret.

Alur yang dituju:

```text
branch fitur -> pull request -> CI + build Node -> merge branch deployment
                                                   |
                                                   v
                                Hostinger build -> subdomain course
```

Pada fase migrasi, jangan menghubungkan branch yang masih berisi runtime Sites ke deployment otomatis Hostinger. Setelah port selesai dan diuji, gunakan `main` sebagai branch deployment awal. Pilih branch tersebut pada integrasi Hostinger bila pengaturan tersedia; verifikasi perubahan branch lain tidak memicu deployment.

Jadikan hasil CI sebagai syarat merge jika paket GitHub mendukung aturan branch tersebut. Integrasi Hostinger yang otomatis merespons push tidak dengan sendirinya menunggu GitHub Actions. Jika aturan branch tidak tersedia, merge hanya setelah seluruh check berhasil dan gunakan deployment manual untuk rilis yang memerlukan pengawasan.

Perubahan terlihat di subdomain setelah build dan deployment selesai, bukan setiap kali file diketik. Untuk preview seketika selama coding, gunakan server development lokal.

## Langkah di hPanel setelah port siap

1. Buka Websites lalu Create/Add Website dan pilih Web App/Node.js.
2. Pilih Import Git Repository dan hubungkan akun GitHub. Berikan akses hanya ke repository platform jika pilihan tersedia.
3. Pilih repository dan branch deployment yang telah lolos pengujian.
4. Konfigurasikan Node.js, root aplikasi, perintah install/build/start dan output sesuai hasil port yang sudah diverifikasi. Jangan mengisi nilai dari starter Sites sekarang. Jika root repository adalah source platform, gunakan root aplikasi `.`.
5. Simpan secret database, autentikasi dan URL aplikasi pada environment hosting. Pisahkan dari source GitHub. Sesuaikan URL callback login dengan subdomain HTTPS.
6. Mulai dengan `JUDGE0_ENABLED=false`. Coding wajib tidak dapat diluluskan tanpa layanan penilaian; jadikan latihan tersebut opsional untuk uji perjalanan course.
7. Deploy dan periksa log serta URL sementara dari Hostinger terlebih dahulu.
8. Hubungkan `course.ypi-baitussalam.or.id` sebagai domain aplikasi. Buat record DNS `course` sesuai nilai persis dari hPanel; jangan menebak IP atau mengganti nameserver website utama. Bila sudah ada record `course`, periksa fungsinya sebelum menggantinya.
9. Aktifkan dan verifikasi SSL, URL callback login, serta redirect HTTPS. Cookie platform harus terbatas pada subdomain course.

Menu hPanel dapat berubah. [Panduan resmi Node.js dan integrasi GitHub Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/) menjelaskan paket yang didukung dan langkah deployment.

## Uji penerimaan sebelum peserta masuk

- Halaman katalog terbuka dan halaman akun/kelas memerlukan login.
- Akun peserta baru menunggu persetujuan, tidak menjadi owner.
- Peserta A tidak dapat membaca/mengubah pekerjaan peserta B, termasuk melalui API langsung.
- Mentor hanya mengakses kelas yang ditugaskan; penangguhan akun mencabut akses.
- Kuis wajib, revisi materi, progres dan review tugas tetap bekerja.
- Data bertahan setelah redeploy dan restart; migrasi dijalankan sekali dengan catatan versi.
- Latihan Python/JavaScript browser diuji pada HTTPS. Penilaian Judge0 tetap nonaktif dan hasil browser tidak membuka materi wajib.
- Backup database dapat dipulihkan pada database terpisah. Rollback source tidak otomatis membatalkan migrasi data.

## Biaya dan layanan terpisah

Untuk platform web, paket Node.js yang sudah dimiliki dapat digunakan; tidak perlu membeli VPS untuk tahap ini. Biaya/kuota database dan autentikasi perlu diperiksa sesuai penyedia yang akhirnya dipilih. DNS dan SSL mengikuti fasilitas paket/domain milik pengguna.

Judge0 tetap terpisah dan opsional. Saat diperlukan, gunakan layanan sandbox atau VPS khusus, bukan proses web utama. Lihat [panduan Judge0](Install-Judge0-VPS.md).

Referensi: [opsi Node.js Hostinger](https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/), [actions/checkout](https://github.com/actions/checkout), [actions/setup-node](https://github.com/actions/setup-node).
