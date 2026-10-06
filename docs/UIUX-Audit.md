# Audit tampilan dan kemudahan penggunaan

Audit 7 Oktober 2026 meliputi beranda, katalog/detail course, login/daftar, dashboard, profil, kelas, tugas/review, ruang belajar, sesi, editor course, serta pengelolaan akun dan Tutor.

## Perbaikan

- Menu akun mobile dapat dibuka dengan tombol berlabel, menampilkan semua tujuan dan Keluar tanpa perlu menemukan geser horizontal. Avatar membuka profil.
- Halaman akses dibagi menjadi **Akun pengguna**, **Tutor & pendaftaran**, dan **Riwayat akses**. Persetujuan/penangguhan membuka dialog dekat konteks pengguna dengan fokus pada alasan; pembatalan mengembalikan fokus ke tombol asal.
- Formulir password memiliki tombol tampilkan/sembunyikan yang dapat diakses keyboard. Ukuran bidang dan teks mobile diperbesar; hover tombol utama tetap menjaga warna teks terbaca.
- Header editor dan ruang belajar memakai dua baris pada ponsel kecil. Daftar materi memiliki tombol Tutup dan mendukung Escape dengan pemulihan fokus.
- Nama menu, indikator halaman aktif, fokus, tautan dan istilah Tutor diperjelas. ID teknis akun berada dalam detail yang dapat dibuka. Pencabutan hak Tutor dipisahkan dari tindakan rutin dan membutuhkan konfirmasi antarmuka.
- Preferensi mengurangi gerakan dihormati; pesan, heading panjang dan tombol disesuaikan agar tidak meluber.

## Verifikasi dan batasnya

Komponen halaman akun diuji melalui preview lokal yang memakai data visual Siswa, Tutor dan Super Admin. Preview berada di folder `work` yang diabaikan Git, tidak terhubung ke database hosting, dan tidak memberikan hak login produksi. Pengujian mencakup layar 320, 390, 768 dan 1280 piksel, menu mobile, tampilkan/sembunyikan password, pembatalan dan fokus dialog, tab admin, daftar materi, editor course, serta perjalanan membuka tugas/review Tutor. Layar yang diperiksa tidak memiliki scroll horizontal halaman setelah perbaikan.

Alur backend sebenarnya diperiksa terpisah melalui tes unit serta CI MariaDB 10.11/11.8 dan server Node produksi dengan database sementara. Pengujian web live memeriksa halaman publik, tombol Daftar dan katalog. Akun produksi, izin pengguna, materi dan kiriman tidak digunakan sebagai fixture atau diubah untuk pengujian visual.

Ini audit implementasi internal, belum merupakan penelitian usability dengan siswa/Tutor nyata atau sertifikasi aksesibilitas menyeluruh. Langkah berikutnya adalah meminta beberapa pengguna menyelesaikan pendaftaran, membuka course, mengirim tugas dan memberi review, lalu mengamati kesulitan mereka.
