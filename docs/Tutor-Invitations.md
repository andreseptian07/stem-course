# Undangan Tutor dan pendaftaran Siswa

## Super Admin

1. Masuk, lalu buka **Kelola akses** (`/access`).
2. Pada **Pendaftaran siswa**, pilih **Buka pendaftaran siswa**. Pengaturan tersimpan di database dan berlaku langsung, mengutamakan pilihan admin atas nilai awal `AUTH_REGISTRATION_ENABLED` di hosting.
3. Isi **Undang Tutor**: nama, email penerima, dan kelas opsional. Pilihan kelas hanya mencakup kelas yang belum memiliki Tutor dan belum diarsipkan.
4. Pilih **Buat undangan Tutor**, salin tautan aktivasi, lalu bagikan langsung kepada penerimanya. Belum ada email otomatis. Tautan lengkap hanya muncul setelah dibuat; jangan membagikannya secara publik.
5. Undangan berlaku tujuh hari dan sekali pakai. Undangan baru untuk email yang sama membatalkan undangan lama yang belum dipakai. Admin dapat membatalkan undangan dari daftar.
6. Jika undangan tanpa kelas, setelah aktivasi buka **Kelas & mentor**, edit kelas, dan pilih akun Tutor sebagai pengajar.
7. **Cabut hak Tutor** membutuhkan alasan dan melepas seluruh penugasan mengajar. Akun tetap tersedia sebagai Siswa sesuai status akses; riwayat tugas, review, dan progres tidak dihapus. Penangguhan akun merupakan tindakan terpisah.

## Tutor

1. Buka tautan dari Super Admin, masukkan email penerima.
2. Jika belum mempunyai akun, tentukan password sendiri dan konfirmasi. Jika akun sudah ada, masuk sebagai penerima terlebih dahulu; aktivasi tidak mengganti password akun.
3. Aktifkan, kemudian masuk dan buka **Kelas & mentor**. Tutor mengelola tugas, review, feedback, dan sesi hanya di kelas yang ditugaskan.
4. Tutor tidak dapat mengundang Tutor lain, menyetujui akun, membuka pendaftaran, atau mengedit katalog course global.

Aktivasi undangan merupakan persetujuan admin untuk akun Tutor, termasuk akun Siswa yang sebelumnya masih pending. Akun yang ditangguhkan harus dipulihkan admin sebelum diundang/diaktifkan.

## Siswa

1. Dalam keadaan belum login, pilih **Daftar** di beranda atau **Belum punya akun? Daftar** pada login. Alternatif: pilih **Daftar course** dari detail course.
2. Isi nama, email, password dan konfirmasi. Akun baru selalu Siswa dengan status menunggu persetujuan.
3. Masuk untuk melihat status akses. Course yang dipilih saat pendaftaran sudah disimpan; pencatatan ini belum membuka akses belajar.
4. Setelah Super Admin menyetujui akun, muat ulang status dan buka dashboard untuk melanjutkan course.
5. Siswa yang sudah mempunyai akun dapat masuk dari detail course atau memilih **Daftar course** setelah login. Keanggotaan kelas dengan Tutor tetap memiliki persetujuan terpisah.

Pembayaran siswa, honor Tutor, email verifikasi dan pengiriman undangan otomatis belum termasuk fitur ini.

## Keamanan dan pengujian

Token undangan acak 256 bit; database hanya menyimpan hash SHA-256. Tautan memakai fragmen URL, bukan query yang masuk log server. Halaman aktivasi menghapus fragmen setelah dibaca dan menyimpan token sementara di sessionStorage tab untuk perjalanan login. Aktivasi memerlukan email yang cocok; akun yang sudah ada memerlukan sesi akun penerima. Penerbitan, pembatalan dan pencabutan diperiksa terhadap pemilik yang tersimpan di database.

Klaim undangan, kredensial baru, hak Tutor, penugasan dan audit ditulis satu transaksi dengan bukti aktivasi unik per permintaan. CI pada MariaDB 10.11 dan 11.8 menguji aktivasi bersamaan, penggunaan ulang, pembatalan, kedaluwarsa, perubahan kelas, rollback, penangguhan, pencabutan pada sesi yang masih login, serta pembatasan kelas dan API admin. Tes HTTP menjalankan build Node produksi pada database sementara; jangan arahkan fixture ke hosting produksi.
