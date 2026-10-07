# Persiapan peluncuran gratis Ruang STEM

Pengguna merencanakan sekitar satu minggu pengujian sebelum pemasaran. Peluncuran awal gratis untuk mendapatkan feedback; pembayaran dan honor Tutor akan dibahas kemudian. Target konten minimal tiga course/materi yang siap dipelajari. Konten contoh belum membuktikan materi siap dipasarkan.

## Urutan persiapan

1. Uji alur lengkap Siswa, Tutor dan Super Admin: pendaftaran, persetujuan, belajar, kuis, bergabung kelas, mengirim tugas, revisi, review, notifikasi dan logout. Catat temuan melalui panduan UAT dan template yang tersedia.
2. Verifikasi email dan lupa password sudah tersedia lokal. Konfigurasikan SMTP dan domain pengirim, uji pengiriman, kemudian aktifkan manual melalui panel admin.
3. Lampiran tugas, materi dan foto profil sudah tersedia lokal; lakukan UAT serta siapkan penyimpanan privat persisten untuk hosting. Sertifikat PDF dan verifikasi tersedia lokal; aktifkan per course setelah aturan serta tugas siap dan lakukan UAT. Lihat `Upload-Berkas.md` `Media-Course-Profil.md`, dan `Sertifikat.md`.
4. Hubungkan Judge0 jika course memerlukan penilaian kode resmi; uji sandbox sebelum menjadikan coding syarat lulus.
5. Siapkan minimal tiga course/materi dengan tujuan, prasyarat, susunan belajar, latihan, kriteria kelulusan dan pendamping yang jelas. Jalankan setiap course sebagai siswa dari awal hingga selesai.
6. Verifikasi backup/pemulihan, pencatatan error, tampilan mobile, akses keyboard dan jalur feedback peserta sebelum pemasaran.

Fitur pembayaran belum menjadi syarat peluncuran gratis. Enrollment saat ini tetap tanpa transaksi pembayaran. Feedback awal dapat dicatat secara manual tanpa menambah sistem pembayaran.

## Batas perubahan

Pengembangan berlangsung lokal dengan database Hostinger. Pengguna mengizinkan perubahan database yang diperlukan, dengan mempertahankan data yang ada. Deployment aplikasi, push yang memicu deployment dan perubahan hosting menunggu instruksi eksplisit berikutnya. Migrasi database yang sudah diterapkan tidak berarti source lokal sudah tersedia di web live.
