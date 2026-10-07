# Lampiran tugas — Ruang STEM

Tahap ini menambahkan upload privat untuk tugas Siswa dan unduhan pada review Tutor. Upload materi course dan foto profil dijelaskan terpisah pada `Media-Course-Profil.md`. Aplikasi tetap lokal; hanya migrasi tambahan `project_files` yang diterapkan pada MariaDB Hostinger.

## Alur penggunaan

1. Siswa yang disetujui dalam kelas membuka tugas dengan pengumpulan dibuka, lalu memilih lampiran.
2. PDF, PNG, JPEG, dan teks UTF-8 `.txt` diterima. Maksimal 5 MiB per berkas, tiga lampiran belum dikirim per tugas, dan 200 MiB per akun pada penyimpanan tersebut.
3. Lampiran belum dikirim tersimpan untuk Siswa, termasuk setelah refresh. Tutor dan siswa lain tidak dapat membukanya. Lampiran belum dikirim dapat dihapus, termasuk ketika pengumpulan ditutup.
4. **Kirim pekerjaan** menyimpan penjelasan, tautan opsional, dan lampiran yang siap sebagai satu kiriman. Kiriman lama dan lampirannya tidak ditimpa atau dihapus melalui formulir revisi.
5. Tutor yang saat ini ditugaskan dan Super Admin dapat mengunduh lampiran kiriman. Siswa hanya mengakses miliknya dan harus tetap berstatus anggota yang disetujui. Perubahan penugasan/keanggotaan diperiksa ulang pada setiap unduhan. Kelas arsip tetap dapat dibaca sesuai kebijakan riwayat kelas, tetapi tidak menerima upload/pengumpulan baru.
6. Revisi menggunakan upload baru setelah Tutor meminta perbaikan. Berkas kiriman sebelumnya tetap berada pada riwayat lama.

Upload yang terganggu sebelum siap tidak bisa diunduh atau dikirim. Bila proses berhenti setelah reservasi metadata, lampiran ditandai belum selesai pada daftar Siswa; hapus dan unggah kembali. Menghapus lampiran belum dikirim menghapus berkas tersebut, tanpa fitur pulihkan.

## Penyimpanan lokal dan persiapan hosting

Saat menjalankan `npm run dev:hosting-db`, metadata tersimpan pada database Hostinger tetapi **isi berkas tetap di komputer lokal**, dalam `work/private-uploads/<scope>/<id>`. Folder ini diabaikan Git, berada di luar `public`, dan tidak ikut build/deploy. Jangan menghapusnya apabila berkas UAT masih diperlukan.

`UPLOAD_STORAGE_DIR` dapat menentukan direktori lain. `UPLOAD_STORAGE_ID` menentukan identitas penyimpanan yang stabil; tanpa ID, pengembangan memakai path direktori sebagai identitas. Scope juga mencakup origin `APP_URL`, sehingga web live tidak menampilkan lampiran lokal meskipun database sama.

Produksi memerlukan `APP_URL`, `UPLOAD_STORAGE_ID`, dan `UPLOAD_STORAGE_DIR` absolut pada direktori privat yang persisten **di luar checkout aplikasi**. Aplikasi menolak direktori publik, termasuk root yang mengarah ke direktori publik melalui symlink. Tanpa konfigurasi produksi, upload tidak aktif; tugas berbasis penjelasan/tautan masih berfungsi. Jangan mengubah environment hosting atau memindahkan berkas UAT sebelum deployment diizinkan dan lokasi penyimpanan Hostinger diperiksa.

Backup harus mencakup database **dan** direktori berkas. Metadata database saja tidak dapat memulihkan isi lampiran. Perpindahan origin/identitas penyimpanan memerlukan rencana pemindahan metadata dan berkas yang terpisah; saat ini tidak ada migrasi otomatis antara lokal dan hosting. Jika kegagalan filesystem terjadi setelah penghapusan metadata, sisa berkas perlu dibersihkan oleh operator. Belum ada pembersihan berkas yatim otomatis atau antivirus.

## Perlindungan dan batas pemeriksaan

API memerlukan sesi aktif dan kebijakan verifikasi email yang sama dengan halaman belajar. Upload/hapus memeriksa origin; upload dibatasi 10 percobaan per akun per 15 menit dengan anggaran global 100 percobaan. Body multipart dibaca dengan batas byte aktual dan timeout sebelum parsing; header Content-Length tidak dapat melewati batas. Jenis berkas diperiksa dengan ekstensi dan signature dasar, sementara TXT harus UTF-8 tanpa karakter kontrol berbahaya. Ini bukan pemeriksaan malware atau validitas lengkap dokumen/gambar.

Nama asli hanya metadata. Nama disk berupa UUID yang dibuat server; direktori dibuat mode 0700 dan berkas 0600. Unduhan melalui API berotorisasi selalu memakai attachment, no-store, nosniff, CSP sandbox, dan same-origin. Tidak ada URL publik atau render dokumen sebagai HTML.

Pengumpulan memakai transaksi untuk mengklaim lampiran milik Siswa pada tugas dan penyimpanan yang benar. Klaim parsial atau versi tugas yang kedaluwarsa dikembalikan dalam transaksi yang sama. Siswa lain, lampiran tugas lain, lampiran belum siap, serta penggunaan ulang lampiran kiriman terdahulu ditolak.

Pendekatan jenis/ukuran, otorisasi, nama acak, dan penyimpanan privat mengikuti [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

## Verifikasi

109 tes lokal dan TypeScript lulus, termasuk lifecycle lampiran, versi stale, klaim parsial, revokasi akses, batas berkas dan body. Empat skenario tambahan lulus pada MariaDB Hostinger dalam transaksi rollback; jumlah data yang diperiksa tetap. Suite tersebut juga terhubung ke integrasi MariaDB pada database CI sementara, tetapi suite CI/HTTP penuh belum dijalankan pada sesi ini.

Pratinjau komponen asli dengan data contoh diperiksa untuk formulir Siswa, riwayat pengumpulan, daftar unduhan Tutor, dan lebar mobile. Ini belum menggantikan UAT upload/unduh menggunakan akun Siswa–Tutor sungguhan.

### Uji manual berikutnya

- Upload satu TXT dan satu gambar pada tugas terbuka; refresh, lalu kirim pekerjaan. Tutor mengunduh keduanya dan memeriksa isinya.
- Siswa B mencoba URL lampiran Siswa A: ditolak. Tutor mencoba membuka URL lampiran yang belum dikumpulkan: ditolak.
- Upload berkas lebih dari 5 MiB, file HTML/SVG, atau PDF yang sebenarnya berisi teks biasa: ditolak tanpa menghapus penjelasan yang sedang ditulis.
- Hapus satu lampiran belum dikirim, lalu upload penggantinya. Maksimal tiga lampiran per kiriman.
- Tutor meminta revisi; kirim berkas baru dan pastikan kiriman lama tetap menyimpan berkas lama.
- Tutup pengumpulan dari tab Tutor setelah Siswa mengisi formulir. Pengumpulan stale ditolak dan lampiran belum dikirim tetap tersedia; lampiran itu masih bisa dihapus.
- Keluarkan Siswa atau ubah Tutor kelas; akses unduhan lama ditolak pada permintaan berikutnya. Super Admin tetap dapat membaca riwayat.
