# Paket pengujian manual Ruang STEM

**Tanggal panduan:** 8 Oktober 2026
**Web yang diuji:** https://ruangstem.com
**Acuan rilis:** Tim Kurikulum — 8 Oktober 2026. Koordinator mencatat SHA deployment yang diuji pada lembar hasil.
**Tujuan:** membuktikan alur Admin, Tutor, Siswa, Tim Kurikulum, serta hubungan antarakun berjalan sebelum uji coba gratis dibuka lebih luas.

Ini adalah rencana pengujian, **bukan pernyataan bahwa seluruh kasus telah lulus**. Seluruh hasil awal pada lembar eksekusi adalah **Belum diuji**. Label tombol dapat sedikit berbeda; jika menu atau perilaku berbeda dari panduan, catat versi web dan temuannya.

## Dokumen untuk dibagikan

| Dokumen | Pemakai |
| --- | --- |
| [01 — Admin](01-Admin.md) | Penguji Super Admin/pengelola |
| [02 — Tutor](02-Tutor.md) | Penguji Tutor A dan Tutor B |
| [03 — Siswa](03-Siswa.md) | Penguji Siswa A, B, dan C |
| [04 — Pengujian umum](04-Pengujian-Umum.md) | Semua peran: profil, foto, login/logout, notifikasi, ponsel, keyboard, email |
| [05 — Siklus lintas akun](05-Siklus-Lintas-Akun.md) | Koordinator: urutan eksekusi, serah-terima pekerjaan, pemeriksaan operasional |
| [07 — Tim Kurikulum](07-Tim-Kurikulum.md) | Admin, Tutor penyusun, dan penyusun khusus: penugasan, draf bersama, review dan persetujuan |
| [06 — Hasil dan temuan](06-Hasil-dan-Temuan.md) | Semua penguji: daftar hasil per kasus, laporan bug, pengujian ulang, keputusan rilis |

Bagikan **seluruh folder** agar tautan relatif antardokumen tetap bekerja. Penguji menjalankan dokumen perannya dan pengujian umum, mengikuti urutan koordinator pada dokumen 05. Jangan menjalankan pencabutan hak/sertifikat atau perubahan revisi di awal hanya karena kasusnya sudah terlihat dalam daftar.

## Kondisi aplikasi pada awal panduan

- Rilis Tim Kurikulum memakai sembilan migrasi MariaDB dan penyimpanan upload privat. Pengujian ini dilakukan di web setelah deployment berstatus Selesai dan menu Tim Kurikulum tersedia. UAT menggunakan akun sungguhan masih harus dilaksanakan.
- Email akun sudah memiliki fitur verifikasi/pemulihan, tetapi **SMTP belum dikonfigurasi/diaktifkan** pada deployment terakhir. Persetujuan akses dilakukan manual oleh Admin; reset password tanpa SMTP memerlukan operator teknis, bukan tombol reset di panel Admin.
- Undangan Tutor dibagikan manual melalui tautan, termasuk ketika SMTP akun sudah aktif.
- Notifikasi tersedia **di dalam aplikasi**, bukan email/push saat aplikasi ditutup.
- Penilaian kode resmi Judge0 belum aktif. Latihan JavaScript/Python di browser tidak memberi kelulusan resmi. Course uji utama tidak boleh mensyaratkan kode wajib.
- Sertifikat harus diaktifkan per course dan memerlukan seluruh materi/tes wajib versi terbaru serta **semua tugas terbit/ditutup yang diterima Tutor dalam satu kelas**, minimal satu tugas.
- Course gratis tidak memerlukan pembayaran. Pembayaran, honor Tutor, upload video/DOCX/ZIP, kalender otomatis, serta rekaman meeting bukan fitur yang diuji sebagai tersedia.

Paket ini berisi **177 kasus unik**: 49 Admin, 30 Tutor, 44 Siswa, 27 umum, 7 operasional dan 20 Tim Kurikulum. Kasus umum mempunyai baris hasil terpisah untuk tiga peran; penyusun khusus juga mengulang kasus login/logout, profil, notifikasi, mobile dan keyboard yang relevan, dengan hasil dicatat bersama CUR-03/CUR-13/CUR-20.

Koordinator memeriksa kembali kondisi ini sebelum tiap putaran. Kasus SMTP/Judge0 yang belum dapat dijalankan dicatat **Terblokir**, bukan Lulus atau Tidak berlaku. Terblokir yang diterima untuk pilot gratis tetap mempunyai penanggung jawab dan rencana uji berikutnya.

## Aturan data uji dan bukti

1. Web ini memakai database server yang juga dipakai aplikasi lokal. Gunakan hanya akun, course, kelas, tugas, dan sertifikat uji yang ditetapkan koordinator. Jangan mengubah materi atau akun nyata di luar daftar.
2. Pakai awalan `UAT-<tanggal>-<putaran> —` untuk seluruh nama data, misalnya `UAT-20261008-01 — Dasar STEM`. Panduan memakai nama pendek C1/Kelas A/Tugas A1 agar mudah diikuti.
3. Pakai alamat email yang dikuasai tim; satu alamat untuk satu identitas. Jangan mendaftarkan alamat orang lain. Simpan password di pengelola password atau saluran privat tim, bukan di dokumen hasil.
4. Gunakan profil browser terpisah. Tab biasa berbagi sesi; dua jendela incognito pada browser yang sama juga bisa berbagi sesi. Periksa nama dan peran sebelum menguji.
5. Salin URL objek **uji** dari pengguna yang memang berhak. Jangan menebak atau mencari ID pengguna nyata. Untuk uji privasi, cukup buktikan satu penolakan/kebocoran pada objek uji.
6. Bukti tidak boleh memuat password, cookie, token undangan/reset/verifikasi, kredensial hosting, atau data peserta nyata. Redaksi alamat email bila tidak diperlukan.
7. Penangguhan, pencabutan hak, arsip, revisi materi, dan pencabutan sertifikat dijalankan di fase akhir. Pencabutan sertifikat serta hapus lampiran/foto tidak memiliki pemulihan otomatis; gunakan objek uji yang sudah ditandai boleh dibuang.
8. Jangan menjalankan seed, reset database, uji beban, atau menghabiskan kuota global pada web ini. Pemeriksaan batas penyimpanan besar dan konkurensi skala besar dilakukan di lingkungan pengujian terpisah.

## Identitas dan pemisahan hak

| Alias | Disiapkan oleh | Keadaan awal dan tujuan |
| --- | --- | --- |
| Admin | Pemilik aplikasi | Owner yang sudah ada. Tidak membuat owner kedua. Akses hanya diberikan kepada penguji yang ditunjuk. |
| Tutor A | Undangan Admin | Tutor baru; menangani Kelas A. Tidak menjadi anggota Kelas B. |
| Tutor B | Daftar Siswa dahulu, kemudian undangan Admin | Menguji peningkatan akun yang sudah ada menjadi Tutor; menangani Kelas B. Tidak menjadi anggota Kelas A. |
| Siswa A | Pendaftaran publik | Alur berhasil utama sampai sertifikat. |
| Siswa B | Pendaftaran publik | Salah kuis hingga kuota habis, reset kuota, revisi, isolasi data, pemulihan akses. |
| Siswa C | Pendaftaran publik | Akun pending, kapasitas kelas, penolakan anggota, serta akses tanpa keanggotaan. |
| Penyusun Q1 / Q2 | Pendaftaran publik, aktivasi Admin, penugasan per course | Penyusun khusus tanpa hak Tutor; Q1 untuk C1, Q2 untuk C2. |
| Pengunjung | Profil browser tanpa login | Katalog publik, pembatasan akses, verifikasi sertifikat publik. |

Akun Siswa, hak Tutor, pendaftaran course, keanggotaan kelas, dan verifikasi email adalah **status yang berbeda**. Menyetujui akun tidak otomatis menyetujui kelas. Hak Tutor tidak memberi kemampuan Admin global. Jangan menganggap satu persetujuan menyelesaikan semua status.

## Bahan uji yang dibuat Admin

| Alias | Isi/pengaturan |
| --- | --- |
| C1 — Dasar STEM | Course **buatan tim sendiri**, bukan course contoh bawaan; empat materi di bawah; terbit; sertifikat aktif. |
| C2 — Draft Privat | Satu materi dengan kalimat unik `ISI DRAFT UAT`; gambar/dokumen privat; tetap draft untuk uji akses. |
| C3 — Kode Wajib | Course terpisah untuk uji layanan kode; satu latihan kode wajib. Terbitkan hanya saat fase kasus kode; kembalikan draft sesudahnya. |
| Kelas A | Course C1, Tutor A, kapasitas 2, pendaftaran dibuka; Siswa A/B akhirnya disetujui. |
| Kelas B | Course C1, Tutor B, hanya Siswa B disetujui; ubah menjadi Kelas berjalan sesudah persiapan. |
| Kelas Kosong | Course C1, tanpa Tutor, kapasitas 1; tambahkan Siswa C pada fase sertifikat negatif. Tanpa tugas. |
| Tugas A1 — Penjumlahan | Kelas A, terbit, tenggat besok. Instruksi: jelaskan cara menjumlahkan dua bilangan dan hasil 2 + 3. Kriteria: cara benar dan hasil 5. |
| Tugas A2 — Bukti belajar | Kelas A, terbit; cukup satu paragraf ringkasan. Digunakan untuk membuktikan **semua** tugas harus diterima. |
| Tugas AD — Draft | Kelas A, draft; tidak boleh muncul untuk Siswa dan tidak dihitung sebagai syarat sertifikat. |
| Tugas B1 | Kelas B, terbit; belum diterima ketika menguji isolasi syarat sertifikat antarkelas. |
| Sesi KA | Sesi Kelas A, online, jadwal sekitar 2 jam setelah uji dimulai, 30 menit; gunakan meeting uji yang disediakan tim. |
| Sesi KB | Sesi Kelas B, tatap muka, lokasi fiktif yang jelas bertanda UAT. |
| Sesi C1 | **Sesi course**, dibuat Admin melalui tab Sesi Tutor; kapasitas 1, jadwal mendatang. Berbeda dari sesi kelas. |

### Empat materi C1

| Materi | Konten | Aturan |
| --- | --- | --- |
| M1 — Dasar penjumlahan | Teks, kuis: `2 + 3 = ?` pilihan 4/5/6 (benar 5); `1 + 1 = ?` pilihan 1/2/3 (benar 2). | Wajib lulus, ambang 100, maksimal 3 percobaan, pembahasan setelah lulus. |
| M2 — Membaca bukti | Gambar PNG/JPEG, dokumen PDF dan TXT, video melalui URL yang boleh digunakan tim; satu kuis sederhana. | Kuis Review, tidak mengunci. Dokumen ini belum boleh diakses Siswa sebelum prasyarat M1 terpenuhi. |
| M3 — Latihan JavaScript | Kode awal `console.log(2 + 3);`, input kosong, output harapan `5`. | Latihan kode **tidak wajib**, agar alur utama tetap dapat selesai tanpa Judge0. |
| M4 — Rangkuman | Teks singkat. | Tanpa kuis/kode wajib. |

### Berkas uji

Koordinator menyediakan berkas lokal berisi data sintetis: PDF, TXT UTF-8, PNG dan JPEG valid yang kecil; gambar 1–2 MiB untuk foto; berkas 5 MiB dan sedikit di atasnya; gambar sedikit di atas 2 MiB; berkas kosong; TXT yang diganti ekstensi menjadi `.pdf`; SVG/HTML/DOCX/ZIP kecil. Jangan menggunakan malware atau dokumen pribadi. Catat ukuran byte: **2 MiB = 2.097.152 byte**, **5 MiB = 5.242.880 byte**. Ekstensi saja tidak menjadikan berkas valid.

Upload dibatasi sekitar 10 percobaan per akun per 15 menit dan memiliki anggaran global. Susun upload materi/foto/tugas serta percobaan negatif dalam beberapa jendela uji; jika limit tercapai, catat pesan dan tunggu jendela berikutnya, jangan mengubah server atau mengganti identitas untuk melewati limit. Kasus kirim email yang melewati 3 permintaan per alamat per jam dijadwalkan terpisah.

Untuk uji teks spreadsheet, gunakan nama sintetis seperti `UAT Café`, `UAT "Koma, Uji"`, dan pada putaran terpisah `=1+1`. Jangan memakai formula yang mengakses jaringan atau menjalankan perintah.

## Alamat utama

| Halaman | Alamat |
| --- | --- |
| Beranda / katalog | https://ruangstem.com/ · https://ruangstem.com/courses |
| Login / daftar | https://ruangstem.com/login · https://ruangstem.com/register |
| Dashboard / profil | https://ruangstem.com/dashboard · https://ruangstem.com/profile |
| Akses dan pengelolaan pengguna | https://ruangstem.com/access |
| Tim Kurikulum | https://ruangstem.com/curriculum |
| Editor course | https://ruangstem.com/learn?view=admin |
| Kelas | https://ruangstem.com/classes |
| Sesi course | https://ruangstem.com/learn?view=sessions |
| Notifikasi / sertifikat saya | https://ruangstem.com/notifications · https://ruangstem.com/certificates |
| Ganti password / logout | https://ruangstem.com/password · https://ruangstem.com/logout |
| Pemulihan / verifikasi email | https://ruangstem.com/forgot-password · https://ruangstem.com/verify-email |

URL detail course, materi, kelas, lampiran, PDF sertifikat dan verifikasi diperoleh melalui tombol/tautan aplikasi, lalu dicatat koordinator. Tautan aktivasi/reset/verifikasi email dibagikan privat kepada penerima saja.

## Cara menjalankan dan menilai

- **Wajib:** harus dijalankan untuk pilot; kegagalan dinilai menurut dampaknya.
- **Bersyarat:** membutuhkan layanan, waktu tunggu, atau lingkungan khusus yang disebutkan. Catat hambatannya secara eksplisit.
- Untuk tiap ID, tulis **Lulus / Gagal / Terblokir / Belum diuji / Tidak berlaku** pada dokumen 06, berikut hasil aktual dan bukti. `Tidak berlaku` hanya jika koordinator menetapkan kasus benar-benar di luar lingkup putaran, dengan alasan.
- Hasil “akses ditolak” boleh berupa pengalihan ke login/status akses, 403/404, pesan tidak tersedia, atau kontrol tidak muncul. Yang diuji: **data privat tidak terbuka dan perubahan tanpa hak tidak tersimpan**. Halaman ringkasan kelas/course yang memang publik tidak dianggap bocor.
- Setelah perubahan hak, muat ulang atau lakukan permintaan baru. Konten yang sudah telanjur tampil pada layar tidak otomatis terhapus.
- Jika hasil tidak sesuai, jangan memperbaiki database sendiri. Rekam temuan, koordinasikan perbaikan, lalu jalankan ulang kasus terkait dan siklus utamanya.
