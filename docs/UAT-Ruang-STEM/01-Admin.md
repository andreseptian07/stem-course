# Panduan pengujian manual — Admin Ruang STEM

**Peran:** Super Admin/owner. **Web:** https://ruangstem.com. **Acuan:** 8 Oktober 2026, rilis Tim Kurikulum (catat SHA yang diuji).

Baca [persiapan](00-Mulai-Di-Sini.md), ikuti [urutan lintas akun](05-Siklus-Lintas-Akun.md), dan isi [hasil](06-Hasil-dan-Temuan.md). Admin menggunakan akun owner yang sudah disiapkan pemilik; penguji tidak perlu akses database/hosting. Jalankan juga kasus umum `UM-01`–`UM-17` pada [dokumen 04](04-Pengujian-Umum.md); uji perubahan password owner dikoordinasikan khusus dengan pemilik.

## 1. Akses akun dan pendaftaran

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| ADM-01 | Wajib | Login Admin; buka Dashboard, Kelola akses, editor course; refresh masing-masing. | Identitas Admin benar; semua area pengelolaan terbuka tanpa error; navigasi tidak berubah ke akun lain. |
| ADM-02 | Wajib | Pada Kelola akses → Tutor & pendaftaran, catat status awal; tutup pendaftaran; pengunjung membuka `/register`; buka kembali tanpa redeploy lalu pengunjung refresh. | Saat ditutup pendaftaran baru tidak diterima; setelah dibuka formulir bekerja. Pilihan bertahan setelah Admin refresh. Pengguna lama tetap bisa login. |
| ADM-03 | Wajib | Siswa A/B/C dan calon Tutor B mendaftar. Cari nama masing-masing; gunakan filter status; periksa detail. | Muncul sebagai Siswa pending; pencarian/filter sesuai; belum ada hak Tutor dari pendaftaran biasa. |
| ADM-04 | Wajib | Setujui Siswa A/B dengan alasan UAT; biarkan C pending dahulu. Periksa akun di browser masing-masing. | A/B aktif dan bisa belajar; C tetap dibatasi. Persetujuan akun tidak membuat A/B langsung menjadi anggota kelas. |
| ADM-05 | Wajib | Buka perubahan akses akun uji, kosongkan alasan lalu coba simpan; isi alasan tetapi batalkan. | Alasan kosong ditolak; pembatalan tidak mengubah status. Hanya konfirmasi valid yang menyimpan. |
| ADM-06 | Wajib | Buka Riwayat akses setelah persetujuan; cocokkan pengguna, pengelola, alasan dan waktu. Periksa kontrol akun owner sendiri. | Riwayat akurat; owner tidak dapat menangguhkan dirinya sehingga kehilangan akses pengelolaan. |

## 2. Undangan dan pengelolaan Tutor

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| ADM-07 | Wajib | Buat undangan Tutor A dengan email yang dikendalikan tim, tanpa kelas; salin tautan ke penerima melalui saluran privat. | Tautan aktivasi dibuat dan masa berlaku terlihat; tautan lengkap perlu disalin saat itu; tidak mengklaim email otomatis terkirim. |
| ADM-08 | Wajib | Calon Tutor B sudah terdaftar sebagai Siswa pending. Undang email yang sama; minta Tutor B mengaktifkan sambil login dengan akun penerima. | Tidak terbentuk akun duplikat; akun menjadi aktif dengan hak Tutor; password akun lama tidak diganti oleh undangan. |
| ADM-09 | Wajib | Pada alamat uji cadangan yang belum diaktifkan, buat dua undangan berurutan; coba tautan pertama; batalkan undangan kedua lalu coba tautannya. | Tautan lama digantikan/ditolak; tautan yang dibatalkan ditolak; daftar dan riwayat undangan mengikuti tindakan. |
| ADM-10 | Wajib | Setelah kelas dibuat, periksa pilihan kelas pada undangan baru; coba kelas kosong yang belum ditugaskan pada putaran terpisah. | Hanya kelas tanpa Tutor dan nonarsip dapat dipilih; aktivasi mengaitkan penerima dengan kelas yang masih memenuhi syarat. Kelas A/B yang sudah ditugaskan tidak dapat direbut melalui pilihan tersebut. |
| ADM-11 | Wajib, fase akhir | Setelah review tersimpan, cabut hak Tutor A dengan alasan; Tutor A masih login lalu refresh. | Seluruh penugasannya dilepas; hak review hilang; akun/progres/review lama tetap ada. Akun berfungsi sebagai Siswa sesuai status akses. Riwayat pencabutan tercatat. |

## 3. Course, kurikulum dan media

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| ADM-12 | Wajib | Buat C1 sesuai bahan uji; isi judul, ringkasan, kategori/level dan detail course: tujuan, prasyarat, sasaran, informasi pendamping serta mode belajar yang tersedia. Simpan; buka kembali. | Isian tersimpan pada course yang benar; detail publik sesudah terbit sesuai editor. Course baru bukan contoh bawaan. |
| ADM-13 | Wajib | Tambah empat materi C1; ubah urutan melalui kontrol yang tersedia; tambah lalu hapus satu materi/blok sementara; simpan dan buka ulang. | Materi/blok dan urutan yang disimpan konsisten. Penghapusan hanya mengenai objek uji yang dipilih. Kembalikan urutan M1–M4 sebelum Siswa mulai. |
| ADM-14 | Wajib | Konfigurasi kuis M1 wajib, nilai 100, 3 percobaan, pembahasan setelah lulus; M2 Review; simpan lalu buka kembali. Coba soal tanpa pilihan benar/judul kosong. | Pengaturan valid tersimpan; bentuk kuis tidak valid ditolak dengan pesan yang dapat ditindaklanjuti; materi lain tetap utuh. |
| ADM-15 | Wajib | Konfigurasi JS opsional M3 dan contoh output 5; buka preview/ruang belajar. | Prompt, kode awal, contoh dan status tidak wajib sesuai. Kelulusan resmi tidak disamakan dengan latihan browser. Uji kunci materi tetap memakai akun Siswa. |
| ADM-16 | Wajib | Buat C2 draft berisi teks unik dan dokumen; simpan URL detail/dokumen untuk tim. Terbitkan C1; pengunjung dan Siswa memeriksa katalog. | C1 tampil, isi C2 tidak terbuka; Admin dapat kembali mengedit C2. |
| ADM-17 | Wajib | Pada course baru yang belum disimpan, lihat kontrol upload; simpan course lalu upload PNG/JPEG dan PDF/TXT pada M2. Simpan perubahan course, refresh. | Upload memerlukan course tersimpan. Berkas berhasil menjadi blok setelah course disimpan; gambar/dokumen yang benar tampil. |
| ADM-18 | Wajib | Buka Berkas course; gunakan kembali satu berkas di materi yang sama; unggah berkas kecil lain lalu hapus sebelum pernah disimpan dalam materi. | Penggunaan ulang tidak memerlukan upload ulang. Upload yang belum dipakai dapat dihapus; berkas yang sudah pernah digunakan dipertahankan. Menghapus blok bukan perintah menghapus berkas fisik. |
| ADM-19 | Wajib | Coba dokumen >5 MiB, SVG/HTML/DOCX/ZIP, PDF palsu dan gambar rusak pada jenis blok terkait, bertahap agar tidak terkena limit. | Jenis/ukuran tidak didukung ditolak; pesan jelas; judul dan teks editor yang belum disimpan tidak hilang. Video tetap memakai URL. |
| ADM-20 | Wajib | Ubah editor tanpa simpan, lalu coba pindah halaman; pilih tetap mengedit. Kemudian simpan. | Ada perlindungan/peringatan saat meninggalkan perubahan; memilih tetap tidak membuang isian; penyimpanan berhasil. |
| ADM-21 | Wajib | Buka C2 di dua tab Admin. Simpan perubahan judul di tab pertama, lalu simpan isian lama di tab kedua. | Konflik versi ditolak/diminta muat ulang; data terbaru tidak diam-diam tertimpa. Setelah reload, perubahan tab pertama terlihat. |
| ADM-22 | Wajib, fase revisi | Sesudah Siswa A bersertifikat dan B belum, ubah isi M1 C1; simpan. B memeriksa progres, dokumen M2 dan syarat sertifikat; A memeriksa sertifikat lamanya. | Progres revisi lama ditandai perlu ditinjau; B harus memenuhi prasyarat terbaru. Dokumen A merekam versi saat terbit dan tidak berubah diam-diam. |
| ADM-23 | Wajib, fase akhir | Kembalikan C1 ke draft; Siswa refresh materi/dokumen lewat URL tersimpan; terbitkan kembali. | Akses konten dan dokumen mengikuti status terbaru; draft tidak bocor. Riwayat/progres tidak dihapus hanya karena perubahan status terbit. |

## 4. Kelas, anggota, progres dan sesi course

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| ADM-24 | Wajib | Buat Kelas A/B/Kosong sesuai persiapan, pilih course/Tutor, kapasitas dan tanggal; simpan dan refresh. Coba tanggal akhir sebelum awal atau kapasitas 0. | Data valid tersimpan; tanggal/kapasitas tidak valid ditolak; hanya Admin mengatur kelas dan penugasan global. |
| ADM-25 | Wajib | A/B mengajukan ke Kelas A. Sebelum disetujui pastikan isi internal tertutup; setujui keduanya lewat Peserta & progres; setujui B di Kelas B. | Daftar/status/jumlah anggota sesuai; keanggotaan approved membuka kelas yang benar. Persetujuan berulang tidak menggandakan kursi. |
| ADM-26 | Wajib | Setelah akun C aktif, coba menambah/menyetujui C ke Kelas A yang penuh; coba mengecilkan kapasitas A menjadi 1. Gunakan Kelas Kosong untuk satu permintaan C yang kemudian ditolak. | Kelas A tidak melebihi 2 anggota; penurunan kapasitas di bawah anggota ditolak; penolakan permintaan C tidak menangguhkan akun global. Sesudah kasus, Admin dapat menambahkan C ke Kelas Kosong untuk uji sertifikat. |
| ADM-27 | Wajib | Setelah B salah M1 tiga kali, buka Progres siswa atau progres kelas; buka kuota B; B mencoba lagi. | Kuota dapat dibuka tanpa memberikan nilai lulus/menandai selesai. A tidak terpengaruh. B tetap perlu menjawab benar. |
| ADM-28 | Wajib | Cocokkan tab Progres siswa dengan A/B: materi, skor, percobaan, selesai/revisi lama; buka progres Kelas A. | Hasil konsisten dengan akun dan materi yang diuji; tidak menukar peserta/course; revisi lama terlihat. |
| ADM-29 | Wajib | Di tab Sesi Tutor pada editor buat Sesi C1 online kapasitas 1; uji jadwal lampau, durasi di luar 15–480 menit, URL tidak HTTPS; buat juga sesi tatap muka berlokasi. | Validasi menolak data tidak sah; sesi valid tersimpan dengan waktu WIB; ini sesi course dengan RSVP, bukan sesi kelas. |
| ADM-30 | Wajib | Siswa A RSVP Sesi C1, B mencoba ketika penuh; ubah detail/jadwal sesi; A cek dashboard; batalkan RSVP A lalu B mendaftar. | Jumlah peserta dan agenda mengikuti keadaan terakhir; kapasitas tidak terlampaui; peserta yang mendaftar mendapat tautan online, yang belum mendaftar tidak mendapatnya. |
| ADM-31 | Wajib, fase akhir | Akhiri keanggotaan B di Kelas A; B mencoba kembali URL kelas/feedback/lampiran. Pulihkan keanggotaan melalui penambahan/persetujuan Admin. | Akses internal dicabut lalu pulih sesuai status; progres course dan Kelas B tidak ikut terhapus. |
| ADM-32 | Wajib, fase akhir | Pindahkan/melepas Tutor A dari Kelas A; bandingkan akses Tutor lama/baru dan dashboard; kembalikan bila kasus berikut masih memerlukannya. | Hak pengelolaan mengikuti penugasan terbaru pada permintaan berikutnya; riwayat review tetap ada; Tutor lama tidak lagi melihat kiriman privat kelas itu. |
| ADM-33 | Wajib, fase akhir | Arsipkan Kelas A setelah seluruh review/sertifikat selesai; anggota mencoba posting, pengumpulan, jadwal atau review. | Kelas menjadi riwayat sesuai hak; operasi tulis kelas arsip ditolak. Sertifikat yang sudah terbit tidak otomatis dicabut. |
| ADM-34 | Wajib, fase akhir | Tangguhkan Siswa B dengan alasan saat masih login; B refresh dashboard/kelas; pulihkan. Ulangi untuk Tutor B setelah penugasan/review tercatat. | Akun ditangguhkan tidak dapat menggunakan akses belajar/review melalui sesi lama; pemulihan mempertahankan data. Riwayat akses mencatat tindakan; akun owner tetap operasional. |

## 5. Sertifikat dan laporan

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| ADM-35 | Wajib | Aktifkan sertifikat C1 pada Detail course; simpan; pastikan tugas A1/A2 terbit dan AD draft. Siswa membuka syarat. | Syarat mencakup seluruh materi/tes wajib dan kedua tugas terbit dalam kelas yang dipilih; AD tidak dihitung. Kelas tanpa tugas tidak cukup. |
| ADM-36 | Wajib | Sesudah A menerbitkan, buka tab Sertifikat; cocokkan nama/course/kelas/versi/nomor/tanggal dengan akun A dan verifikasi publik. | Daftar Admin sesuai; tidak mengubah status akademik. PDF unduhan privat adalah hak pemilik, bukan unduhan publik dari daftar Admin. |
| ADM-37 | Wajib, fase akhir | Matikan sertifikat C1 sebelum B menerbitkan; A cek dokumen lama, B cek penerbitan; aktifkan kembali. | Penerbitan baru dihentikan; sertifikat lama A tidak otomatis dicabut. |
| ADM-38 | Wajib, fase akhir, objek sekali pakai | Pilih sertifikat **uji A** yang ditandai boleh dicabut. Coba alasan kosong; lalu isi alasan privat dan konfirmasi. Pengunjung dan A memeriksa ulang. | Alasan wajib; status publik dicabut tanpa nama/alasan privat; unduhan berikutnya ditolak. PDF lama tidak dapat ditarik dari perangkat. Tidak dapat menerbitkan ulang otomatis untuk pasangan Siswa–course–kelas yang sama. |
| ADM-39 | Wajib | Buka Laporan; pilih C1 dan periode 7 hari, muat ulang; cocokkan daftar A/B/C dengan pendaftaran/progres/kelas yang benar-benar dibuat. | Peserta unik berbeda dari pasangan peserta–course; mengikuti dua kelas C1 tidak menggandakan pasangan C1. Pending/suspended ditandai sesuai, bukan hilang sembarang. Owner bukan peserta laporan. |
| ADM-40 | Wajib | Ubah periode 7/30/90, course dan opsi contoh; gunakan pencarian nama/status pada tabel. | Filter bekerja; kondisi kosong jelas. Course contoh default dikecualikan, course draft tetap dapat dilaporkan. Pencarian hanya menyaring tampilan tabel. |
| ADM-41 | Wajib | Catat antrean sebelum A mengirim A1, sesudah kirim, sesudah diminta revisi, sesudah kirim ulang dan diterima; bandingkan dashboard Tutor. | Antrean menghitung kiriman **terakhir** yang menunggu review. Riwayat percobaan tidak digandakan; kelas tanpa Tutor tampak belum ditugaskan; kelas arsip tidak menjadi antrean aktif. |
| ADM-42 | Wajib | Periksa penyelesaian C1 sesudah materi A selesai tetapi tugas belum diterima, setelah sertifikat terbit, dan setelah M1 direvisi. | Selesai materi/tes berbeda dari kelayakan sertifikat; revisi lama tidak dihitung selesai terbaru. Sertifikat valid versi lama tetap dihitung sampai dicabut. |
| ADM-43 | Wajib | Unduh tiga CSV: course, peserta/aktivitas, beban Tutor. Pilih satu course/periode; ubah pencarian tabel; unduh lagi. | CSV memakai filter course/periode, **tidak** filter pencarian tabel; kolom dan hitungan sesuai; waktu CSV ISO UTC sedangkan layar WIB; tidak memuat email, isi tugas, jawaban atau feedback privat. |
| ADM-44 | Wajib | Pada data uji, gunakan teks beraksen, koma, tanda kutip dan nama `=1+1`; ekspor lalu buka sebagai data di spreadsheet tim. | Kolom tidak pecah, Unicode terbaca; nama formula tampil sebagai teks dan tidak dievaluasi menjadi 2. Jangan gunakan formula berbahaya. Kembalikan nama sebelum sertifikat. |

## 6. Pengaturan email dan layanan kode

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| ADM-45 | Wajib pada kondisi sekarang | Kelola akses → Email akun; Muat ulang saat SMTP belum siap; periksa tombol uji/aktifkan dan pilihan kewajiban verifikasi. | Status menjelaskan belum siap; pengiriman tidak aktif otomatis. Jangan mewajibkan verifikasi pada pilot sebelum email benar-benar bekerja. Persetujuan manual tetap tersedia. |
| ADM-46 | Bersyarat: SMTP | Operator mengisi SMTP melalui jalur privat. Admin Muat ulang → Kirim email uji ke akun saya; cek inbox/spam; Aktifkan email; refresh. | Uji hanya dikirim ke email Admin sendiri; aktivasi memerlukan uji berhasil; konfigurasi terisi saja tidak otomatis mengaktifkan email. Kredensial tidak ditampilkan ke browser. |
| ADM-47 | Bersyarat: SMTP | Sesudah akun uji siap, wajibkan verifikasi; A belum verifikasi mencoba belajar, lalu memverifikasi. C masih pending melakukan verifikasi. Matikan kewajiban lalu nonaktifkan email untuk uji sakelar; pulihkan kebijakan pilot. | A dibatasi sampai terverifikasi; C tetap membutuhkan persetujuan Admin; owner tetap dapat mengelola. Email tidak dapat dinonaktifkan ketika kewajiban masih aktif. |
| ADM-48 | Bersyarat: lingkungan uji email | Dua tab pengaturan: ubah/simpan tab pertama lalu kirim perubahan tab lama. Operator mengubah konfigurasi SMTP uji, lalu Admin memeriksa status. | Tab lama tidak menimpa diam-diam. Konfigurasi SMTP berubah memerlukan uji dan aktivasi ulang; kewajiban verifikasi tidak dihapus diam-diam. Jangan merusak konfigurasi email produksi yang sedang dipakai. |
| ADM-49 | Wajib untuk kondisi nonaktif; sukses resmi bersyarat | Buka tab Pemeriksa kode; siapkan C3 terpisah dengan kode wajib; Siswa mencoba penilaian resmi saat layanan belum aktif. | Ketidaktersediaan dijelaskan dan hasil browser tidak membuka syarat wajib/sertifikat. Keberhasilan penilaian resmi dicatat Terblokir sampai Judge0 siap, lalu ikuti SIS-35. |

## Serah-terima Admin

Serahkan ke koordinator: URL course/kelas/tugas uji, alias Tutor yang ditugaskan, bukti persetujuan, nomor sertifikat uji yang boleh dicabut, ekspor CSV sintetis dan daftar temuan. Jangan menyerahkan password atau token di laporan. Pastikan status pendaftaran dan email setelah pengujian sesuai keputusan pemilik aplikasi.
