# Panduan pengujian manual — Siswa Ruang STEM

**Peran:** Siswa A (alur berhasil), B (batas/revisi/privasi), C (pending/kapasitas). **Web:** https://ruangstem.com. **Acuan:** 8 Oktober 2026, rilis Tim Kurikulum (catat SHA yang diuji).

Baca [persiapan](00-Mulai-Di-Sini.md), ikuti [urutan lintas akun](05-Siklus-Lintas-Akun.md), dan isi [hasil](06-Hasil-dan-Temuan.md). Jalankan juga `UM-01`–`UM-17` pada [pengujian umum](04-Pengujian-Umum.md). Siswa A/B/C menggunakan email berbeda dan profil browser terpisah.

## 1. Pengunjung, pendaftaran dan persetujuan

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| SIS-01 | Wajib | Tanpa login buka beranda/katalog/detail C1; gunakan pencarian/filter yang tersedia. Buka URL C2 draft yang diberikan Admin. | Branding Ruang STEM; ringkasan course terbit sesuai; draft tidak muncul/isinya tidak terbuka. |
| SIS-02 | Wajib | Tanpa login buka Dashboard, Profil, Kelas internal, belajar dan sertifikat saya lewat URL uji yang dicatat koordinator. | Diminta login; konten privat, kiriman, nilai dan profil tidak dibuka. Tautan verifikasi sertifikat publik diuji terpisah. |
| SIS-03 | Wajib | Saat pendaftaran ditutup oleh Admin, coba daftar; setelah dibuka, dari detail C1 pilih Daftar course; isi nama/email/password 15–128 karakter dan konfirmasi. | Penutupan bekerja; pendaftaran valid menghasilkan Siswa pending; course pilihan tercatat dan belum memberi akses belajar. |
| SIS-04 | Wajib | Coba email tidak valid, nama kosong, password terlalu pendek/konfirmasi berbeda; satu percobaan mendaftar email akun uji yang sudah ada. | Input ditolak dengan pesan jelas; tidak membuat akun ganda dan tidak memberi hak Tutor/Admin. Jangan mengulang banyak kali. |
| SIS-05 | Wajib | Login A/B/C sebelum disetujui; buka status akses, Dashboard dan belajar langsung. | Hanya status akses sendiri tersedia; belum boleh belajar/internal kelas. Notifikasi akun sendiri boleh tersedia. |
| SIS-06 | Wajib | Admin menyetujui A/B; refresh status lalu buka Dashboard dan C1; biarkan C pending. | A/B aktif dan course terdaftar dapat dilanjutkan; C tetap dibatasi. Belum otomatis anggota Kelas A. |
| SIS-07 | Wajib | Akun aktif mendaftar C1 lagi dari detail course; Tutor yang juga belajar dapat menjalankan kasus serupa. | Course tidak digandakan; enrollment tidak menaikkan hak pengguna atau menggantikan persetujuan kelas. |

## 2. Materi, kuis, kode dan progres

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| SIS-08 | Wajib | A membuka C1 dari Dashboard, M1; periksa teks, urutan, durasi dan kontrol navigasi; refresh URL materi. | Course/materi pilihan tetap benar; tidak berpindah acak; konten dapat dibaca. |
| SIS-09 | Wajib | A jawab salah satu soal M1 salah; kirim; coba Tandai selesai, Selanjutnya dan URL M2/dokumen M2 langsung. | Nilai belum 100/lulus; materi wajib belum dapat diselesaikan/dilewati; pembahasan dan dokumen terkunci tidak terbuka. |
| SIS-10 | Wajib | A pada percobaan berikut menjawab 5 dan 2; kirim, baca pembahasan, Tandai selesai lalu lanjut M2. | Lulus 100; pembahasan terbuka; penyelesaian tersimpan; prasyarat M2 terpenuhi. |
| SIS-11 | Wajib | B jawab salah pada M1 tiga kali; coba lagi; setelah Admin/Tutor membuka kuota, ulangi dengan benar. | Percobaan dibatasi hanya akun/materi terkait; reset kuota bukan kelulusan otomatis; jawaban benar kemudian dapat lulus. A tidak ikut dibatasi. |
| SIS-12 | Wajib | Pada M2 putar video, lihat gambar dan unduh PDF/TXT; jawab kuis Review dengan salah lalu Tandai selesai. | Berkas/tautan benar dan dapat dipakai setelah prasyarat; kuis Review gagal tidak mengunci kelanjutan. Catat bila layanan video eksternal tidak tersedia. |
| SIS-13 | Wajib | M3 pilih Coba gratis di browser; jalankan `console.log(2 + 3);`, ubah menjadi `console.log(6);`, pulihkan; selesaikan M3/M4. | Contoh benar menghasilkan 5, contoh salah tidak cocok; hasil browser tidak memberi kelulusan resmi. Latihan opsional tidak menghalangi penyelesaian course utama. |
| SIS-14 | Wajib | Sesudah empat materi selesai, cek Dashboard/progres; refresh, logout/login dan lanjut dari Dashboard. | Progres materi yang sama bertahan; 4 dari 4/100% sebelum revisi; akun B/C tidak mendapat progres A. |
| SIS-15 | Wajib | A tulis diskusi course dan B membalas pada course yang sama; refresh; tulis satu kalimat seperti `<b>UAT</b>` sebagai teks biasa. | Diskusi tampil di course yang benar dengan nama/waktu; isi pengguna tidak dieksekusi sebagai HTML aktif. Diskusi course dibaca pengguna yang berhak pada course, bukan pesan pribadi. |
| SIS-16 | Wajib, fase revisi | Admin mengubah M1; B cek Dashboard, M1, M2/dokumen dan syarat sertifikat sebelum memperbarui progres. | Progres revisi lama tidak meloloskan syarat terbaru; materi terdampak perlu ditinjau, prasyarat diperiksa kembali. Selesaikan versi terbaru untuk meneruskan. |

## 3. Kelas, diskusi, feedback dan sesi

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| SIS-17 | Wajib | A/B minta bergabung Kelas A; sebelum Admin menyetujui, refresh detail dan coba URL diskusi/tugas/sesi internal. | Status pending; ringkasan publik boleh terlihat, tetapi isi internal belum terbuka. |
| SIS-18 | Wajib | Sesudah Admin menyetujui, A/B refresh; B masuk Kelas B yang disetujui; A mencoba Kelas B. | A/B mendapat hak Kelas A; hanya B punya hak peserta Kelas B; A tidak membaca data privat B1. |
| SIS-19 | Wajib | C sudah aktif, mencoba Kelas A penuh; pada Kelas Kosong buat permintaan lalu Admin menolak. | Tidak melampaui kapasitas; penolakan jelas; akun C tetap aktif global. Catat keadaan C sebelum Admin menambahkannya untuk kasus sertifikat tanpa tugas. |
| SIS-20 | Wajib | A tulis diskusi Kelas A, B membalas; Tutor kirim pengumuman dan Feedback pribadi untuk A; A dan B membandingkan tampilan. | Diskusi/pengumuman kelas terlihat sesuai hak; hanya A melihat feedback pribadi A. Siswa tidak dapat membuat pengumuman staf. |
| SIS-21 | Wajib | Buka agenda/sesi Kelas A dan Dashboard; periksa perubahan jadwal Tutor, online/tatap muka, durasi dan waktu WIB. | Jadwal/tautan/lokasi sesuai kelas; URL meeting tidak bocor ke nonanggota. Sesi kelas tidak dianggap membutuhkan RSVP sesi course. |
| SIS-22 | Wajib | Buka daftar Sesi course C1; sebelum RSVP periksa tautan meeting; A daftar ke kapasitas 1, B mencoba; A batal lalu B daftar. | Tautan online hanya setelah RSVP; jumlah/kursi benar; daftar berulang tidak menggandakan; pembatalan membuka tempat. Agenda Dashboard dan pengingat mengikuti RSVP. |

## 4. Pengumpulan tugas dan lampiran

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| SIS-23 | Wajib | Di Kelas A periksa tugas A1/A2/AD; buka A1; coba penjelasan kosong atau tautan HTTP, kemudian isi penjelasan dan tautan HTTPS valid/biarkan kosong. | Draft AD tidak terlihat; penjelasan wajib; tautan opsional menerima HTTPS tanpa kredensial; input tidak sah ditolak. |
| SIS-24 | Wajib | Pada tugas terbuka unggah satu TXT dan satu PDF/gambar; refresh sebelum mengirim; hapus satu lampiran **uji yang boleh dibuang**, unggah pengganti. | Lampiran draft milik sendiri bertahan; hapus hanya berkas yang dipilih; belum tersedia untuk Tutor/Siswa lain. Jangan mengharapkan teks penjelasan yang belum dikirim otomatis tersimpan setelah refresh. |
| SIS-25 | Wajib | Bertahap coba berkas kosong, >5 MiB, PDF palsu, SVG/HTML/DOCX/ZIP; coba lampiran keempat sesudah tiga draft valid. | Berkas salah/terlalu besar dan lampiran keempat ditolak; isian penjelasan saat itu tidak hilang. Maksimal 3 per kiriman; jangan menghabiskan kuota global. |
| SIS-26 | Wajib | A kirim A1 dengan penjelasan dan berkas valid; refresh; coba mengirim ulang ketika masih menunggu review. | Satu kiriman menunggu review tersimpan; berkas/tautan sesuai; tidak bisa menimpa kiriman atau membuat percobaan kedua tanpa permintaan revisi. |
| SIS-27 | Wajib | Tutor meminta revisi; A baca feedback/nilai/notifikasi; ubah penjelasan, tambah lampiran baru dan kirim revisi; Tutor menerima. | Percobaan baru tercatat, riwayat dan berkas lama bertahan; kiriman terbaru Diterima; feedback/nilai benar dan tidak tertukar. |
| SIS-28 | Wajib | A1 diterima tetapi A2 belum; A coba sertifikat. Kirim A2 dan tunggu Tutor menerima. | Satu tugas diterima belum cukup; semua tugas terbit/ditutup kelas terpilih harus diterima. |
| SIS-29 | Wajib | Pada tugas uji tambahan, kirim sesudah tenggat ketika masih dibuka; saat Tutor menutup, coba pengiriman; buka lagi jika status Perlu revisi. | Lewat tenggat diterima dengan penanda terlambat; status ditutup mencegah kiriman baru; buka kembali dan permintaan revisi memungkinkan kiriman baru. |
| SIS-30 | Wajib | A membagikan URL **uji** lampiran/kiriman ke koordinator; B dan pengunjung mencoba membuka; A mencoba lampiran B1. | Masing-masing hanya dapat membaca pekerjaan sendiri. Tautan yang diketahui tidak memberi hak; pengunjung dan akun lain ditolak. |
| SIS-31 | Wajib | A membuka form revisi di tab lama; Tutor mengubah instruksi/tugas atau mereview kiriman sehingga versi berubah; A coba submit dari tab lama. | Konflik ditolak/diminta muat ulang; data lama tidak menimpa instruksi atau review terbaru; riwayat tetap benar. |

## 5. Sertifikat

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| SIS-32 | Wajib | C1 sertifikat aktif; sebelum belajar selesai, kemudian sesudah materi selesai tetapi tugas belum dikirim/menunggu/Perlu revisi, buka Sertifikat & syarat kelulusan dan coba terbitkan. | Checklist menyebut syarat belum terpenuhi; belum dapat menerbitkan meskipun progres materi 100%. |
| SIS-33 | Wajib | A semua syarat selesai; pilih Kelas A, Muat ulang syarat, periksa nama; tanpa centang persetujuan coba penerbitan, lalu setujui dan terbitkan. | Memerlukan persetujuan informasi publik; nomor unik diterbitkan untuk A–C1–Kelas A; nama dari profil tersimpan. |
| SIS-34 | Wajib | Unduh PDF A dan buka; klik tautan verifikasi; ulangi permintaan/refresh; lihat Sertifikat saya. B coba URL PDF A; pengunjung buka verifikasi. | PDF terbaca, nama/course/versi/nomor/tanggal benar; tautan memakai ruangstem.com; nomor tidak berubah pada permintaan ulang; PDF privat; verifikasi publik hanya informasi sertifikat yang disetujui. |
| SIS-35 | Bersyarat: Judge0; penolakan nonaktif tetap wajib | Pada C3 kode wajib jalankan contoh browser saat Judge0 mati; cek kunci. Setelah operator mengaktifkan layanan uji, kirim kode salah dan benar, cek kuota/kelulusan/materi berikutnya. | Browser tidak meluluskan kode wajib. Saat server tersedia, output/test gagal tidak lulus, seluruh syarat server benar baru lulus. Jangan uji kode merusak jaringan/sistem. Kasus sukses resmi Terblokir selama layanan mati. |
| SIS-36 | Wajib | B anggota Kelas A dan B; semua tugas A diterima tetapi B1 belum; ganti pilihan kelas sertifikat. C di Kelas Kosong tanpa tugas mencoba pula. | Kelulusan tugas Kelas A tidak digabung ke Kelas B; Kelas Kosong memerlukan minimal satu tugas diterima. |
| SIS-37 | Wajib, fase revisi | Sebelum sertifikat B terbit, instruksi A1 berubah sesudah review lama diterima. Cek syarat; kirim revisi sesudah Tutor meminta, lalu cek lagi setelah diterima. | Review instruksi lama tidak cukup; syarat terbaru harus dipenuhi. Perubahan tenggat/judul/penutupan saja tidak membatalkan penerimaan. |
| SIS-38 | Wajib, fase akhir | A sudah bersertifikat; ubah nama profil A sesudah penerbitan; Admin revisi course dan arsip kelas; unduh/verifikasi lagi. | Dokumen lama mempertahankan nama/judul/versi bukti penerbitan, bukan berubah menjadi nama/versi baru. Arsip tidak otomatis mencabut. |
| SIS-39 | Wajib, fase akhir, objek sekali pakai | Admin mencabut sertifikat uji A; A refresh/unduh dan coba penerbitan lagi; pengunjung cek verifikasi. | Status dicabut tanpa nama/alasan privat; unduhan baru dan penerbitan ulang otomatis ditolak. Salinan PDF lama memerlukan verifikasi terkini. |
| SIS-40 | Wajib | B belum bersertifikat; sementara pakai nama uji dengan emoji, coba terbitkan sesudah semua syarat terpenuhi; pulihkan nama Latin, refresh dan terbitkan. | Karakter tidak didukung font ditolak sebelum nomor terbit; setelah nama valid tersimpan, PDF dapat dibuat. Jangan ubah nama pengguna nyata. |

## 6. Pembatasan dan pemulihan

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| SIS-41 | Wajib | Login A/B; buka URL editor, laporan/CSV Admin, pengaturan email dan daftar akun yang diberikan koordinator. | Tidak dapat mengelola kurikulum, pengguna, kelas, laporan global atau pengaturan email. Halaman akses hanya akun sendiri. |
| SIS-42 | Wajib, fase akhir | B masih login; Admin tangguhkan; B mencoba belajar, tugas dan lampiran. Admin pulihkan; B refresh. | Permintaan baru ditolak saat suspended; data lama pulih sesuai hak sesudah dipulihkan. |
| SIS-43 | Wajib, fase akhir | Admin akhiri keanggotaan B di Kelas A; B mencoba diskusi, feedback/lampiran A miliknya; Kelas B diperiksa. | Akses internal A hilang; status akun global dan keanggotaan B tidak ikut dicabut. Sesudah disetujui lagi hak mengikuti keadaan terkini. |
| SIS-44 | Wajib, fase akhir | Kelas A diarsipkan; B/A yang masih anggota membuka riwayat lalu mencoba diskusi/pengumpulan baru. | Riwayat tersedia sesuai hak, operasi tulis ditolak. Progres course dan sertifikat valid tetap ada. |

## Serah-terima Siswa

Catat progres per materi, jumlah percobaan kuis, status anggota, nomor percobaan tugas, review terakhir, serta nomor sertifikat uji. Minta Tutor/Admin membandingkan hasil di akunnya masing-masing. Jangan memasukkan berkas pribadi, password atau token pada laporan.
