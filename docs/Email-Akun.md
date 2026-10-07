# Email akun Ruang STEM

Implementasi lokal tersedia untuk verifikasi email dan pemulihan password. Dua tabel tambahan sudah diterapkan di Hostinger tanpa mengubah kredensial atau status akses akun yang ada. Aplikasi hosting belum dideploy.

## Alur pengguna

- `/forgot-password`: masukkan email akun, lalu buka tautan dari email untuk membuat password baru. Respons permintaan sama untuk email terdaftar/tidak terdaftar. Tautan berlaku 30 menit, sekali pakai, hanya untuk pemulihan.
- `/verify-email`: minta tautan atau buka tautan dari email dan tekan **Verifikasi email saya**. Tautan berlaku 24 jam, sekali pakai. Membuka halaman saja tidak menghabiskan tautan.
- Status verifikasi tampil pada halaman Akses akun. Kepemilikan email terpisah dari persetujuan Siswa dan penugasan Tutor.
- Pendaftaran menjadwalkan email verifikasi jika mode pengiriman sudah aktif. Jika penjadwalan gagal, akun tetap dibuat dan pengguna dapat meminta tautan ulang.
- Password baru mengikuti aturan 15–128 karakter; sesi lama dicabut, token lama tidak berlaku, dan pengguna harus masuk kembali. Email pemberitahuan perubahan password dijadwalkan tanpa menyertakan password.

## Mode pengiriman lokal

Tambahkan pada `.env.local` yang diabaikan Git:

```dotenv
MAIL_DELIVERY=preview
AUTH_REQUIRE_EMAIL_VERIFICATION=false
```

Jalankan ulang `npm run dev:hosting-db`. Email disimpan sebagai JSON privat di `work/account-mail/`, bukan dikirim melalui jaringan. Direktori ini diabaikan Git; berkas dibuat dengan izin 0600. Buka berkas secara lokal dan salin tautannya ke browser. Berkas berisi alamat penerima dan tautan yang dapat mengubah akun: jangan unggah, tempel ke chat atau masukkan dalam screenshot. Mode preview hanya diizinkan pada localhost dalam mode development, ditolak pada produksi. Hapus berkas setelah UAT selesai melalui pengelolaan berkas lokal.

Mode lokal memakai database Hostinger. Jika memakai akun sungguhan saat UAT, verifikasi/password yang berhasil tetap mengubah akun di database server. Pengujian otomatis sesi pengembangan memakai fixture dalam transaksi yang di-rollback, bukan mengubah password pengguna yang ada.

## Aktivasi manual pada panel Super Admin

Buka **Kelola akses → Email akun**. Panel menampilkan kelengkapan SMTP, hasil uji dan status aktif; kredensial SMTP tidak dikirim ke browser.

1. Lengkapi konfigurasi SMTP secara privat dan jalankan ulang proses lokal agar environment terbaru terbaca.
2. Tekan **Muat ulang** lalu **Kirim email uji ke akun saya**. Email uji hanya menuju alamat akun Super Admin yang sedang masuk, tanpa alamat penerima bebas.
3. Periksa inbox/spam. Setelah server SMTP menerima email uji, tombol **Aktifkan email** dapat digunakan. Penerimaan oleh SMTP belum membuktikan email masuk inbox.
4. Tekan **Aktifkan email** untuk mengaktifkan pengiriman akun secara manual. Tidak aktif otomatis hanya karena kolom environment terisi.
5. Pilihan **Wajibkan verifikasi email sebelum belajar** terpisah. Aktifkan setelah akun Siswa/Tutor siap; jika ingin mematikan email, matikan kewajiban ini terlebih dahulu.

Pengaturan tersimpan pada tabel `settings` yang sudah ada, tanpa migrasi tambahan. Pengaturan dipisahkan per origin aplikasi, sehingga localhost dan domain produksi tidak berbagi sakelar aktivasi meskipun databasenya sama. Hasil uji terikat pada konfigurasi SMTP dan origin; perubahan host, port, akun, password atau alamat pengirim menonaktifkan pengiriman efektif sampai diuji serta diaktifkan ulang. Kewajiban verifikasi yang sudah dipilih tetap dipertahankan sampai Super Admin mengubahnya.

Hanya identitas owner yang diperiksa ulang pada server dapat mengubah pengaturan. Versi mencegah perubahan dari tab lama menimpa pengaturan terbaru. Konfigurasi SMTP diisi melalui environment privat, bukan disimpan sebagai password mentah di tabel pengaturan. Database hanya menyimpan sidik konfigurasi untuk mengikat hasil uji; nilai ini tidak dikirim ke browser.

## SMTP sungguhan

Gunakan nilai dari panel email Hostinger/penyedia yang dipilih; jangan menebak akun pengirim. Simpan secara privat:

```dotenv
MAIL_DELIVERY=smtp
MAIL_FROM=noreply@domain-anda
SMTP_HOST=host-dari-panel-email
SMTP_PORT=465
SMTP_USER=akun-smtp-anda
SMTP_PASSWORD=password-privat
AUTH_REQUIRE_EMAIL_VERIFICATION=false
```

Port 465 memakai TLS langsung; port 587 wajib STARTTLS. Validasi sertifikat dan TLS minimal 1.2 dipertahankan. Konfigurasi tidak membolehkan port 25 atau pengabaian sertifikat. Password SMTP tidak di-trim dan tidak dicetak. Jangan menyalin kredensial ke source, log, Git atau chat.

`APP_URL` menentukan alamat tautan, bukan header Host dari pemohon. Aplikasi lokal otomatis memakai `http://127.0.0.1:5173`; email dari lokal hanya dapat dipakai pada komputer tersebut. Pada deployment nanti, gunakan domain HTTPS yang telah tersambung. Mengisi SMTP lokal tidak mengubah konfigurasi hosting.

## Aktivasi kewajiban verifikasi

Setelah tes pengiriman sungguhan dan UAT lulus, gunakan pilihan **Wajibkan verifikasi email sebelum belajar** pada panel Super Admin. `AUTH_REQUIRE_EMAIL_VERIFICATION` menjadi nilai awal sebelum pengaturan panel untuk origin tersebut disimpan; setelah tersimpan, pilihan panel menjadi sumber keputusan. Login dan API pembelajaran menolak akun non-owner yang belum terverifikasi; pemeriksaan juga berlaku untuk sesi lama. Halaman status akses dan alur verifikasi tetap tersedia. Owner mempertahankan akses operator agar masalah pengiriman tidak mengunci pengelola.

Akun lama tidak otomatis dianggap terverifikasi. Kirim tautan melalui halaman Verifikasi email untuk akun tersebut sebelum mengaktifkan kewajiban. Pemulihan password sendiri tidak menyetujui akun, mengaktifkan Tutor atau menggantikan langkah verifikasi email.

## Batas operasional dan pemeriksaan

Pengiriman berjalan sesudah respons HTTP memakai Next.js `after`. Belum ada antrean email persisten, retry worker, pelacakan bounce atau jaminan email diterima. Jika proses berhenti setelah respons, pengguna perlu meminta tautan baru. Kegagalan pengiriman yang tertangkap menghapus token yang belum terkirim, mencatat pesan umum tanpa alamat/token, dan mempertahankan jalur bantuan operator.

Permintaan verifikasi/pemulihan dibatasi global 20/jam dan per alamat 3/jam; konfirmasi dibatasi global 100/15 menit dan per token 10/15 menit. Batas global konservatif ini perlu disesuaikan setelah mengukur traffic pilot dan kemampuan penyedia SMTP. Budget tersimpan di database dan tidak bisa dilewati melalui header forwarding.

105 tes otomatis dan sembilan skenario MariaDB untuk email telah lulus. Fixture Hostinger dibatalkan dan jumlah baris diperiksa kembali. Tes mencakup tujuan/umur/penggunaan ulang tautan, perubahan email/password, race password, pencabutan sesi, privasi respons, rate limit dan kegagalan pengiriman. Pengaturan aktivasi/versi/kewajiban verifikasi juga diuji pada Hostinger dengan pengirim mock dan rollback. Panel desktop/mobile diperiksa dengan data contoh. Suite HTTP CI penuh serta pengiriman inbox sungguhan belum dijalankan pada sesi ini.

Sebelum peluncuran, uji email terdaftar/tidak terdaftar, inbox/spam, tautan baru/kedaluwarsa, sekali pakai, reset setelah ganti password, sesi di perangkat lain, pendaftaran pending, dan akun Tutor/Owner. Ikuti [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) dan [konfigurasi SMTP Nodemailer](https://nodemailer.com/smtp) sebagai rujukan implementasi.
