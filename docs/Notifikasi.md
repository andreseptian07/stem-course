# Notifikasi Ruang STEM

Halaman `/notifications` tersedia bagi pengguna yang sudah masuk, termasuk akun yang menunggu persetujuan. Lencana notifikasi dipasang pada navigasi utama, dashboard, kelas, pengelolaan akses dan editor. Ada filter semua/belum dibaca, muat ulang, penandaan satu notifikasi dan penandaan seluruh daftar. Membuka notifikasi melalui tombol Buka juga menyimpan status baca sebelum berpindah halaman.

## Cakupan

- Persetujuan, pemulihan dan penangguhan akses akun sendiri; Super Admin melihat permintaan pendaftaran yang masih menunggu.
- Undangan Tutor yang valid untuk email akun yang sudah terdaftar, serta aktivasi Tutor. Undangan untuk orang yang belum memiliki akun tetap memerlukan tautan undangan dari pengelola; tidak ada pengiriman email otomatis.
- Penugasan kelas, tugas yang terbit, pengumuman orang lain, dan hasil review kiriman terbaru.
- Kiriman terbaru yang masih menunggu review untuk Tutor yang ditugaskan atau Super Admin.
- Pengingat sesi kelas bagi anggota disetujui, Tutor kelas dan Super Admin; sesi course hanya untuk akun yang mendaftar ke sesi tersebut. Pengingat muncul mulai 24 jam sebelum jadwal dan hilang saat sesi dimulai. Waktu ditampilkan dalam WIB.

## Penyimpanan dan batas

Daftar berasal dari data aplikasi yang masih berlaku, bukan salinan seluruh riwayat kejadian. Hak akses diperiksa ulang setiap permintaan: anggota yang dikeluarkan, penugasan yang dicabut atau kelas yang diarsipkan tidak tetap menghasilkan notifikasi kelas. Akun yang ditangguhkan hanya dapat melihat informasi aksesnya sendiri.

Maksimal 100 notifikasi terbaru ditampilkan dan dihitung pada lencana. Tabel `notification_reads` hanya menyimpan ID akun, ID kejadian yang di-hash dan waktu baca. Review yang berubah menghasilkan ID baru agar hasil baru belum dibaca. Penandaan seluruh daftar hanya menyimpan ID yang sudah tampil, sehingga kabar yang baru datang tidak ikut tertandai. ID milik orang lain atau kejadian yang sudah tidak tersedia ditolak; muat ulang daftar jika datanya berubah.

Halaman dan lencana mengambil data tiap 45 detik ketika tab terlihat, serta saat kembali ke tab. Ini adalah notifikasi di aplikasi: belum ada email, push browser atau pemberitahuan saat aplikasi ditutup. Isi kiriman, feedback, nilai, token undangan dan tautan meeting tidak disalin ke daftar notifikasi.

## Verifikasi

Tes bersama mencakup privasi Siswa/Tutor/Super Admin, akun terbatas, pembacaan berulang, ID palsu, perubahan review, batas waktu pengingat, RSVP, undangan, pencabutan akses, arsip dan batas 100 item. Tes dijalankan pada SQLite sementara serta MariaDB Hostinger dalam transaksi yang dibatalkan. Migrasi MariaDB tambahan sudah diterapkan; aplikasi web hosting belum dideploy.
