# Sertifikat penyelesaian Ruang STEM

Fitur tersedia lokal. Migrasi tambahan tabel `certificates` telah diterapkan pada MariaDB Hostinger; aplikasi belum di-deploy. Tidak ada sertifikat pengguna sungguhan yang diterbitkan pada pengujian ini.

## Aturan kelulusan

Super Admin membuka editor course → Detail course, mencentang **Aktifkan sertifikat penyelesaian**, lalu menyimpan. Course lama default tidak aktif. Course harus terbit, bukan course contoh, dan mempunyai materi.

Sesuai keputusan pengguna, tugas yang diterima Tutor juga menjadi syarat:

1. Seluruh materi pada revisi terbaru ditandai selesai.
2. Seluruh kuis wajib dan latihan kode wajib sudah lulus melalui penilaian server. Praktik Python/JavaScript di browser tidak memberi kelulusan kode resmi. Jika Judge0 belum aktif, course dengan kode wajib belum dapat disertifikasi.
3. Siswa memilih satu kelas yang terhubung ke course dan keanggotaannya disetujui. Seluruh tugas berstatus terbit atau ditutup pada kelas itu harus diterima Tutor/pengelola melalui alur review resmi; kelas perlu minimal satu tugas. Tugas draft tidak dihitung.
4. Yang diperiksa adalah kiriman terakhir dan instruksi tugas yang masih sesuai. Mengubah deadline, judul atau menutup tugas saja tidak membatalkan penerimaan. Jika instruksi berubah, Tutor perlu meminta revisi, membuka lagi tugas jika ditutup, dan menilai ulang. Kelas arsip tetap dapat menjadi bukti penyelesaian.

Tugas kelas lain tidak digabung. Satu sertifikat diterbitkan per Siswa–course–kelas. Pengulangan permintaan memakai nomor yang sama. Penerbitan memeriksa kembali progres, course, keanggotaan, daftar tugas dan review dalam satu pernyataan database.

## Alur Siswa

Buka course → **Sertifikat & syarat kelulusan**. Daftar menampilkan materi/tes/tugas yang belum terpenuhi. Pilih kelas, gunakan Muat ulang syarat setelah review Tutor, lalu pastikan nama benar dan setujui informasi yang tampil pada halaman verifikasi. Nama berasal dari nama akun/profil yang telah disimpan, tidak dari input bebas saat penerbitan.

Setelah diterbitkan, unduh PDF melalui panel tersebut atau **Sertifikat saya** pada navigasi akun. PDF hanya dapat diunduh pemilik dengan akun aktif. PDF dibuat saat diunduh; tidak memerlukan folder upload. Nomor menggunakan format `RS-TAHUN-32KARAKTERACAK`, dan PDF memuat tautan verifikasi yang dapat diklik.

Nama dan judul harus didukung font Noto Sans yang dibundel: huruf Latin beserta aksen, Yunani dan Kiril. Emoji serta aksara lain yang belum didukung ditolak sebelum penerbitan, agar PDF tidak diam-diam mengganti karakter. Dukungan font dapat diperluas jika konten membutuhkannya.

## Verifikasi dan pencabutan

Tautan `/certificates/verify/<nomor>` dapat dibuka tanpa login. Status valid menampilkan nama penerima, judul course, versi, nomor dan tanggal penerbitan. Tidak menampilkan email, ID akun/kelas, nilai, kiriman, feedback atau alasan pencabutan. Tidak tersedia daftar sertifikat publik, dan halaman meminta mesin pencari tidak mengindeks.

Sertifikat merekam penyelesaian pada saat diterbitkan. Perubahan course, profil, tugas atau arsip kelas setelah itu tidak mengubah dokumen lama. Siswa perlu memenuhi syarat terbaru untuk penerbitan pertama; sertifikat lama tidak menyatakan penguasaan revisi baru. Dokumen tidak menggunakan tanda tangan kriptografis; status terkini diperiksa melalui situs.

Super Admin membuka editor → tab **Sertifikat**, memilih dokumen, menulis alasan privat dan mengonfirmasi pencabutan. Status publik menjadi dicabut tanpa nama penerima, dan unduhan berikutnya ditolak. PDF yang sudah diunduh tidak dapat ditarik kembali; verifikasi menyatakan status terbaru. Tidak ada pemulihan atau penerbitan ulang otomatis untuk kelas yang sertifikatnya dicabut.

Menonaktifkan sertifikat course menghentikan penerbitan baru, tetapi tidak mencabut dokumen lama. Untuk kesalahan pada dokumen lama, gunakan pencabutan. Daftar Siswa/admin menampilkan maksimal 200 sertifikat terbaru; pencarian/paginasi belum tersedia.

## Lokal dan hosting

Saat ini tautan dalam PDF mengarah ke `APP_URL` lokal. Tautan tersebut belum dapat diperiksa oleh masyarakat sebelum deployment. Setelah deployment diizinkan dan `APP_URL` memakai domain HTTPS yang benar, unduhan ulang dokumen memakai URL verifikasi domain itu. Data sertifikat dan bukti penerbitan berada di Hostinger, sehingga backup database perlu mencakup tabel ini. Font PDF dilacak dalam build Node; penyimpanan upload tidak digunakan untuk PDF.

Font berasal dari repository resmi Noto, dengan SIL Open Font License yang disertakan pada `assets/fonts/OFL.txt`. Pembuat PDF menggunakan [pdf-lib](https://pdf-lib.js.org/).

## Pemeriksaan dan UAT

122 tes lokal, TypeScript dan build lulus; font PDF tercakup dalam hasil build. Tujuh skenario sertifikat juga lulus pada Hostinger dalam transaksi rollback; jumlah baris pada tabel terkait tetap. PDF contoh diperiksa secara visual dan teksnya dapat diekstrak. Komponen diperiksa dengan data contoh pada desktop/mobile, termasuk persetujuan nama dan tombol yang diblokir saat tugas belum diterima. Modul baru lulus lint; lint seluruh repository masih memiliki temuan lama. Suite MariaDB/HTTP CI penuh dan UAT multiakun sungguhan belum dilakukan.

UAT dengan course/kelas uji yang ditandai jelas:

1. Admin aktifkan sertifikat pada course bukan contoh, buat minimal satu tugas, dan setujui anggota kelas.
2. Siswa mencoba penerbitan sebelum materi/kuis/kode wajib selesai: harus ditolak.
3. Selesaikan materi dan tes wajib; coba saat tugas belum dikirim, menunggu review dan diminta revisi: sertifikat tetap belum tersedia.
4. Tutor menerima seluruh tugas. Siswa muat ulang syarat, periksa nama, setujui informasi verifikasi, terbitkan dan unduh PDF. Klik lagi penerbitan/muat ulang: nomor tidak berubah.
5. Akun lain mencoba URL PDF: akses ditolak. Pengunjung membuka verifikasi: hanya informasi yang dijelaskan di atas tampil.
6. Ubah materi/instruksi sebelum penerbitan pada Siswa kedua: progres/review lama tidak melewati syarat. Tutup tugas tanpa mengubah instruksi: penerimaan tetap dihitung.
7. Gunakan kelas kedua dengan tugas belum diterima: penerimaan kelas pertama tidak memenuhi kelas kedua. Arsip kelas yang telah selesai: dokumen yang sudah terbit tetap tersedia.
8. Admin mencabut dokumen uji dengan alasan, lalu periksa verifikasi, penolakan unduhan, dan penolakan penerbitan ulang. Langkah pencabutan harus dikerjakan hanya pada dokumen uji yang memang dimaksudkan untuk dicabut.
