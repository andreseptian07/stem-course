# STEM Studio

MVP platform e-course berbahasa Indonesia: ruang belajar, authoring course, kuis bertingkat, latihan coding, diskusi mentor, dan jadwal sesi online/offline. Konten ESP32 bawaan hanya contoh yang boleh diganti.

## Pilihan teknologi

TypeScript dan React untuk antarmuka serta API; ekosistem Node.js untuk pengembangan. Starter Vinext menyediakan routing kompatibel Next.js dengan runtime Cloudflare Workers untuk hosting Sites. Penyimpanan menggunakan D1 (SQLite) dan migrasi Drizzle. Runtime produksi ini bukan server Node.js biasa; migrasi ke VPS/Next.js memerlukan penyesuaian adapter database, autentikasi, dan deployment.

Latihan gratis Python (Pyodide) dan JavaScript berjalan di browser pada iframe opaque origin dan Web Worker. Hanya contoh publik yang dinilai; hasil tidak dapat meluluskan tes wajib. Penilaian resmi menjalankan kode melalui Judge0 di mesin sandbox terpisah. Bahasa backend tidak membatasi bahasa latihan: adapter mendukung Python, JavaScript, dan C++. Jangan menjalankan kode peserta langsung di proses web atau menonaktifkan sandbox Judge0.

## Fitur tersedia

- Dashboard `/dashboard`: course yang diikuti, progres berdasarkan revisi materi, tombol melanjutkan, filter status, dan sesi mentor yang didaftarkan. Course dengan progres lama tetap dikenali. Tombol Mulai belajar di detail course menambahkan enrollment tanpa pembayaran dan aman dipanggil berulang.
- Profil `/profile`: nama tampilan, institusi, biodata, minat, tujuan belajar, dan warna avatar inisial. Email mengikuti akun ChatGPT dan hanya tampil pada pemilik akun. Belum ada unggah foto. Profil memakai versi untuk menolak penimpaan dari tab lain; perubahan yang belum disimpan dilindungi saat navigasi.
- Profil dan enrollment disimpan di D1 melalui migrasi tambahan `drizzle/0001_fair_timeslip.sql`. API akun selalu memakai identitas server, tidak menerima role atau ID akun lain dari isian profil. Profil pribadi tidak dimasukkan dalam respons katalog.
- Beranda `/`, katalog `/courses` dengan pencarian/filter, dan detail `/courses/[id]`. Ruang belajar sekarang di `/learn`; tautan lama `/?course=...` dialihkan ke ruang belajar.
- Informasi detail dikelola di Pengaturan course: tujuan, prasyarat/alat, peserta yang dituju, format belajar, dan profil mentor. Course draft tidak tampil di katalog. Estimasi durasi dihitung dari materi; jadwal berasal dari sesi admin.
- API katalog hanya mengirim ringkasan kurikulum, bukan blok materi, kunci jawaban, hidden tests, atau tautan meeting. Akses Site tetap privat; halaman depan belum dibuka untuk pengunjung internet umum.
- Course draft/terbit; modul dan urutan materi; blok teks, judul, catatan, video HTTPS, gambar HTTPS, kode, dan diagram sederhana.
- Tes review atau wajib lulus, nilai minimum, batas percobaan, pilihan jawaban tunggal/jamak, pembahasan configurable.
- Penguncian materi divalidasi pada server. Kunci jawaban dan hidden test case tidak dikirim lewat API peserta. Revisi materi membatalkan progres lama pada materi yang berubah.
- Editor latihan kode, public/hidden test cases, riwayat penilaian, polling hasil Judge0, batas sumber daya eksekusi. Adapter sudah ada; endpoint Judge0 belum dihubungkan.
- Diskusi per materi dan balasan mentor; pembaruan berkala 15 detik, bukan panggilan suara/video langsung.
- Jadwal sesi online/offline dalam WIB, kapasitas, daftar/batal ikut, tautan meeting eksternal. Video conference disediakan melalui layanan pilihan pengajar.
- Admin materi, aturan kuis, latihan kode, jadwal, progres peserta, dan reset percobaan.
- Kelas `/classes`: owner membuat kelompok untuk satu course, menugaskan mentor, mengatur kapasitas dan periode, menyetujui peserta, serta mengarsipkan kelas. Mentor dipilih dari akun yang sudah pernah masuk; penugasan berlaku hanya pada kelas tersebut.
- Ruang kelas menyediakan diskusi, pengumuman mentor, sesi online/offline dalam WIB, progres per materi, dan feedback pribadi. Peserta hanya melihat feedback untuk dirinya; daftar peserta dan progres hanya tersedia untuk owner/mentor kelas. Reset kuota percobaan tidak memberikan kelulusan.
- Tugas proyek berada di ruang kelas: owner/mentor membuat instruksi, tenggat WIB, serta status draft/dibuka/ditutup. Peserta aktif mengirim penjelasan dan tautan HTTPS; mentor memberi feedback, nilai opsional 0–100, serta hasil diterima/perlu revisi. Kiriman baru hanya tersedia pada pengiriman pertama atau setelah permintaan revisi, maksimal 20 versi per peserta/tugas dan 100 tugas per kelas. Kiriman terlambat tetap diterima dan ditandai.
- Riwayat kiriman dan salinan instruksi saat pengiriman disimpan di D1. Peserta hanya melihat kirimannya sendiri; mentor yang ditugaskan dan owner dapat melihat kiriman kelas. Review memakai versi untuk menghindari penimpaan; hanya kiriman terbaru yang dapat ditinjau, dan review yang diperbarui mengganti feedback pada kiriman tersebut. Arsip kelas mematikan penulisan. Nilai proyek tidak meluluskan kuis/coding atau membuka materi wajib. Tautan dibuka oleh mentor secara manual; belum ada unggah berkas, eksekusi repositori, atau pemeriksaan hardware otomatis.
- Agenda dashboard menggabungkan sesi umum yang didaftarkan dan sesi dari kelas yang diikuti/dimentori. Sesi kelas menggunakan tautan meeting eksternal; belum ada rekaman, absensi, atau pengingat otomatis. Course tidak dapat diganti setelah kelas dibuat; progres tetap melekat pada akun dan course meskipun keanggotaan kelas berakhir.

## Menjalankan lokal

Node.js >=22.13 diperlukan. Instal dependency sesuai lockfile, salin variabel nonrahasia dari `.env.example` ke `.dev.vars`, lalu gunakan `npm run dev -- --hostname 127.0.0.1`. Database lokal dan database hosting terpisah. Kredensial serta `.dev.vars` tidak boleh di-commit.

Skema: `db/schema.ts`. Migrasi awal: `drizzle/0000_previous_toxin.sql`. Untuk perubahan skema jalankan `npm run db:generate` dan terapkan migrasi melalui workflow hosting. Database lokal yang sudah dibuat tidak perlu diinisialisasi ulang.

## Autentikasi dan admin pertama

Versi awal diterbitkan privat untuk pemilik melalui Sites dengan Sign in with ChatGPT. Header identitas hanya tepercaya di belakang gateway autentikasi Sites; jangan mengekspos Worker langsung ke internet tanpa gateway yang menghapus header identitas dari klien.

`OWNER_SETUP_ENABLED=true` digunakan hanya pada deployment privat awal. Pengguna pertama yang terautentikasi disimpan sebagai owner secara atomik di tabel settings. Setelah pemilik berhasil masuk, operator sebaiknya mengubah flag menjadi `false` sebelum memperluas akses. Owner tetap tersimpan walaupun flag dimatikan. Penugasan mentor atau persetujuan peserta kelas tidak memberikan izin akses Site: akun lain perlu mendapat akses Site dan masuk dahulu sebelum muncul pada pilihan akun kelas. Site saat ini tetap privat untuk pemilik. Akses peserta umum, onboarding komersial, pembayaran, sertifikat, peran mentor global untuk authoring course, backup/restore operasional, moderasi, dan load test belum menjadi bagian MVP ini.

## Mengaktifkan pemeriksaan kode

1. Sediakan layanan Judge0 terisolasi yang mendukung batch submissions. Aktifkan sandbox, matikan akses jaringan peserta, perbarui image keamanan, dan tetapkan kuota biaya di penyedia.
2. Atur secret `JUDGE0_TOKEN` jika layanan menggunakan X-Auth-Token, serta `JUDGE0_URL` HTTPS melalui environment hosting; bukan formulir peserta atau source code.
3. Sesuaikan `JUDGE0_PYTHON_ID`, `JUDGE0_JAVASCRIPT_ID`, `JUDGE0_CPP_ID` dengan daftar bahasa pada instalasi Anda. Default 71/63/54 harus diverifikasi pada endpoint tersebut. Adapter menerima X-Auth-Token atau secret JUDGE0_API_KEY dengan JUDGE0_API_HOST untuk RapidAPI. Aktifkan JUDGE0_ENABLED setelah konfigurasi ditinjau.
4. Uji jawaban benar, salah, runtime error, timeout, dan hidden tests end-to-end sebelum peserta diundang. Pengujian unit menggunakan fetch palsu; belum membuktikan sandbox produksi.

Tanpa endpoint, hanya tombol penilaian resmi dinonaktifkan; latihan browser tetap tersedia untuk Python/JavaScript. Pada course contoh, latihan kode wajib akan menahan materi berikutnya; admin dapat menjadikannya opsional untuk mencoba keseluruhan alur sebelum layanan aktif. Penilaian program console tidak membuktikan perangkat ESP32/STM32 atau rangkaian fisik bekerja.

## Verifikasi

```sh
npx tsc --noEmit
node --experimental-strip-types --test tests/rules.test.mjs tests/code-security.test.mjs tests/classes.test.mjs tests/projects.test.mjs
npm run build
```

Pengujian aturan mencakup syarat progres, revisi, penilaian multi-jawaban, penyembunyian kunci/test tersembunyi, validasi isian, dan kontrak adapter Judge0. Uji browser dilakukan pada database lokal, terpisah dari data hosting.

Tambahan `node tests/account-api.mjs` dijalankan hanya dengan pratinjau localhost dan mock login aktif. Tes ini menyimpan ulang profil lokal tanpa mengubah isi, menaikkan versinya, serta mendaftarkan course contoh. Pemeriksaan mencakup akses anonim, penolakan role/ID akun lain, origin, konflik versi, persistensi, privasi katalog, dan enrollment idempotent. Jangan arahkan tes ini ke hosting produksi.

`node tests/classes-api.mjs` membuat kelas dan pesan uji pada localhost. Tes SQLite kelas mencakup kapasitas, konflik versi, privasi feedback, pencabutan mentor/keanggotaan saat penulisan, agenda, arsip, progres berdasarkan revisi, dan reset percobaan. Migrasi tambahan `0003` menambahkan tabel kelas, peserta, pesan, feedback, serta jadwal; data contoh pengujian lokal tidak dipindahkan ke produksi.

Migrasi `0004` menambahkan tugas proyek dan riwayat kiriman. `tests/projects.test.mjs` menguji batas akses, privasi, konflik versi, snapshot instruksi, revisi, serta pencabutan izin saat penulisan. `node tests/projects-api.mjs` memakai fixture kelas ESP32 lokal untuk memeriksa autentikasi, origin, validasi, persistensi, dan konflik versi; tidak dijalankan pada produksi.

## Struktur kode

- `app/studio.tsx`, `app/admin.tsx`: pengalaman peserta dan pengelola.
- `app/api/studio/route.ts`: API terautentikasi, otorisasi dan penyimpanan.
- `app/classroom.tsx`, `app/api/classes/route.ts`, `lib/classes.ts`: antarmuka kelas, API, dan aturan akses per kelas.
- `lib/rules.ts`, `lib/validation.ts`: aturan progres dan validasi.
- `lib/judge.ts`: adapter eksekusi terisolasi.
- `lib/server.ts`, `db/schema.ts`, `drizzle/`: data, role, dan migrasi.
- `.openai/hosting.json`: identitas Site; gunakan Site yang sama untuk penerbitan selanjutnya.

Panduan pemasangan terpisah: [Install Judge0 di VPS](docs/Install-Judge0-VPS.md). Migrasi `0002` menambahkan lease polling dan indeks antrean. Reservasi pengiriman/kuota atomik, pembatasan satu pengiriman aktif per akun, lima pengiriman per menit, maksimal 20 attempt aktif global, dan refund kegagalan/timeout tepat sekali. Respons Judge0 dibatasi ukurannya, base64 untuk output non-UTF8, status/token divalidasi, hasil tersembunyi disaring, dan revisi lama tidak meluluskan materi baru. Pengujian SQLite memakai database sementara; tidak mengakses produksi. Uji mesin sandbox produksi masih menunggu layanan yang disediakan pengguna.

`node --experimental-strip-types tests/code-api.mjs` menguji penolakan pemalsuan kelulusan dan membuat course JavaScript uji lokal. Jalankan hanya pada preview localhost.
