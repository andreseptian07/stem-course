# Pengembangan lokal — 7 Oktober 2026

Perubahan dikerjakan dan diperiksa di komputer lokal. Jangan push ke main, memicu deployment, atau mengubah environment hosting sebelum pengguna meminta deployment setelah meninjau perubahan.

## Menjalankan aplikasi

```sh
cd /Users/mc/E-Course/platform
npm run dev:hosting-db
```

Buka http://127.0.0.1:5173. Koneksi MariaDB tetap memakai Hostinger melalui `.env.local`. File ini berisi rahasia dan tidak boleh disalin ke laporan atau Git. `npm run db:check` memeriksa koneksi tanpa menulis data.

Database tersebut juga digunakan web live. Pada 7 Oktober 2026 pengguna mengizinkan perubahan database yang diperlukan karena web belum digunakan secara umum. Migrasi tambahan tabel status baca notifikasi telah diterapkan; data lama dipertahankan. Pengujian notifikasi pada Hostinger dilakukan dalam satu transaksi yang di-rollback, dengan jumlah baris seluruh tabel terkait diperiksa kembali. Jangan menjalankan reset, seed CI, atau suite pengujian destruktif pada database ini. Aksi tulis melalui aplikasi lokal tetap memengaruhi database server; data UAT yang disimpan harus jelas ditandai sebagai data uji.

`npm run check` memakai fixture sementara di memori untuk tes data; tidak memakai database Hostinger. `npm run build` memeriksa build lokal dan tidak melakukan deployment. Tes `test:mariadb`/`test:http` tetap dibatasi pada database CI sementara di localhost; jangan menghapus pembatasnya agar dapat memakai live.

## Dashboard Tutor

- Akun Tutor membuka `/dashboard` untuk melihat kelas penugasannya, antrean review, dan jadwal mengajar. Tutor tanpa penugasan mendapat penjelasan kondisi kosong.
- Super Admin mendapat ringkasan semua kelas nonarsip. Penugasan mentor lama juga tetap dikenali.
- Antrean hanya memuat kiriman terbaru berstatus menunggu review dari anggota kelas yang disetujui. Kiriman diterima, sedang direvisi, anggota yang dikeluarkan, dan kelas arsip tidak muncul. Tugas yang ditutup tetap dapat direview.
- Antrean menampilkan maksimal 50 kiriman terlama; jumlah total tetap mencakup seluruh antrean. Isi pekerjaan, URL lampiran, instruksi dan feedback tidak dikirim dalam ringkasan.
- Jadwal mengajar mencakup sesi berlangsung dan mendatang dalam WIB. Buka kelas untuk detail sesi.
- **Belajar saya** menampilkan dashboard pembelajaran pribadi. **Muat ulang** mengambil data terbaru; ringkasan dashboard diperbarui melalui tombol tersebut. Notifikasi memiliki pembaruan berkala sendiri.
- Jumlah siswa merupakan jumlah keanggotaan yang disetujui; satu siswa dalam dua kelas dihitung dua kali.

## Verifikasi dan pekerjaan berikutnya

TypeScript, 129 tes otomatis dan build lokal lulus. Delapan skenario notifikasi juga lulus pada MariaDB Hostinger dalam transaksi yang di-rollback; tidak ada fixture uji yang disimpan. Migrasi menambahkan `notification_reads`, `auth_email_status`, `auth_email_tokens`, `project_files`, `media_files`, dan `certificates`. Empat skenario lampiran lulus pada Hostinger dalam transaksi rollback; isi berkas sintetis sementara juga dihapus. Sembilan skenario email juga lulus pada Hostinger dengan fixture di-rollback. Empat skenario materi/foto juga lulus pada Hostinger dengan rollback dan jumlah baris terkait tetap. Tujuh skenario sertifikat lulus pada Hostinger dengan rollback dan jumlah baris terkait tetap. Enam skenario laporan juga lulus di Hostinger dengan rollback dan jumlah baris terkait tetap; tidak ada migrasi laporan. Suite integrasi MariaDB/HTTP CI penuh belum dijalankan pada sesi ini.

Dashboard Tutor dan notifikasi diperiksa menggunakan pratinjau desktop/mobile dengan data contoh lokal. Pengujian ini belum menggantikan UAT multiakun sungguhan. Ikuti `Panduan-Uji-Manual.md` dan catat temuan pada `Template-Temuan-UAT.csv`; database pengujian terpisah tetap membantu memisahkan data latihan dari konten peluncuran.

Nama yang terlihat pada aplikasi dan judul halaman kini **Ruang STEM**. Nama repository, cookie, dan identitas teknis database tetap dipertahankan agar koneksi dan akun yang ada tetap berfungsi.

Verifikasi email dan lupa password sudah diimplementasikan dengan mode email uji lokal; SMTP sungguhan belum dikonfigurasi dan kewajiban verifikasi belum diaktifkan. Aktivasi sekarang tersedia manual pada Kelola akses → Email akun, setelah konfigurasi lengkap dan email uji berhasil. Pengaturannya tersimpan per origin pada tabel settings; uji Hostinger memakai mock dan rollback. Lihat `Email-Akun.md`. Tahap berikutnya: konfigurasi SMTP, pengujian pengiriman inbox/spam, serta UAT multiakun. Lampiran tugas sekarang tersedia lokal dengan metadata di Hostinger dan isi berkas privat di komputer. Lihat `Upload-Berkas.md` untuk UAT serta kebutuhan penyimpanan persisten sebelum deployment. Upload materi dan foto profil juga tersedia lokal; lihat `Media-Course-Profil.md`. Sertifikat PDF/verifikasi/pencabutan tersedia lokal, dengan kelulusan materi, tes wajib dan tugas yang diterima Tutor; lihat `Sertifikat.md`. UAT multiakun, konten minimal tiga course dan eksekusi kode resmi masih perlu disiapkan. Peluncuran awal direncanakan gratis untuk mendapatkan feedback; pembayaran dibahas kemudian. Lihat `Persiapan-Peluncuran-Gratis.md`.

Lint repository masih gagal pada aturan yang sudah ada, terutama penggunaan any dan aturan React hooks. TypeScript, tes, serta build tetap diperiksa terpisah; hasil lint tidak dinyatakan lulus.

Laporan pengelola tersedia pada tab Laporan, dengan filter course/periode, progres revisi terbaru, aktivitas tercatat, antrean Tutor dan ekspor CSV. Lihat `Laporan-Pengelola.md`. Berikutnya UAT multiakun serta persiapan minimal tiga course dan layanan operasional.
