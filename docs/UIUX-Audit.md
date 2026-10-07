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

## Perbaikan lanjutan: Keluar

Tautan Keluar selalu tersedia di header dashboard, profil, kelas, pengelolaan akses, dan ruang belajar. Di beranda/katalog, tautan ditampilkan untuk pengguna yang masuk. Tautan membuka halaman konfirmasi Keluar; sesi diakhiri melalui POST agar kunjungan GET tidak mengeluarkan akun. Header mobile memakai dua baris untuk mempertahankan tombol yang terlihat tanpa membuka menu atau menggulir halaman.

Perubahan lanjutan ini diverifikasi di lokal dan belum di-deploy, sesuai instruksi pengguna. Jalankan `npm run dev:hosting-db` lalu buka `http://127.0.0.1:5173`. Database menggunakan konfigurasi Hostinger di `.env.local`; pemeriksaan koneksi berhasil melalui TLS. Jangan gunakan database tersebut untuk seed/reset atau tes integrasi dengan data buatan.

## Perbaikan lanjutan: kembali ke Dashboard

Avatar ST yang mengarah ke dashboard sebelumnya disembunyikan pada mobile. Navigasi bersama ruang belajar, sesi Tutor dan editor course sekarang memiliki tautan **Dashboard** dengan ikon dan tulisan, tersedia juga saat data masih dimuat. Perubahan editor yang belum disimpan tetap memunculkan konfirmasi sebelum meninggalkan halaman. Navigasi mobile dibagi dua kolom agar semua tujuan terbaca pada layar kecil.

Komponen ketiga tampilan diperiksa dengan data visual lokal pada 320, 768 dan 1280 piksel: tautan terlihat dan tidak terjadi overflow horizontal. Klik Dashboard dari editor berhasil membuka dashboard. Typecheck serta 77 tes lulus. Server aplikasi lokal dengan konfigurasi database hosting tetap aktif; pengujian halaman akun sebenarnya memerlukan login pengguna. Perubahan belum di-deploy.

## Perbaikan lanjutan: alur navigasi dan kondisi kosong

Perpindahan ruang belajar, sesi Tutor dan editor sekarang menyelaraskan URL dengan tampilan. Pilihan course, materi dan pratinjau juga disimpan pada URL dengan encoding yang benar. Refresh tidak lagi mengembalikan tampilan ke tab sebelumnya. Konfirmasi perubahan editor tetap dipertahankan; status perubahan dibersihkan saat perpindahan yang telah dikonfirmasi.

Filter Course saya yang kosong memiliki tombol **Tampilkan semua course saya** untuk mereset filter tanpa meninggalkan dashboard. Halaman sesi kosong menawarkan **Lihat kelas & Tutor**. Course tanpa materi menampilkan petunjuk sesuai peran: Super Admin dapat membuka editor, sementara Siswa diarahkan ke katalog.

Verifikasi preview lokal dengan data uji: perpindahan/refresh Sesi Tutor dan editor, pemilihan/refresh materi, serta pemulihan filter kosong berhasil. Tampilan sesi pada 320 piksel tidak meluber. Tes unit 77 lulus. Perubahan hanya lokal; belum di-deploy dan tidak mengubah data course hosting.
