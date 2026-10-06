# Konfigurasi MariaDB Hostinger

Database dari pengguna:

| Variabel | Nilai |
| --- | --- |
| `DB_HOST` | `153.92.15.31` |
| `DB_PORT` | `3306` |
| `DB_USER` | `u209357671_course_bts` |
| `DB_NAME` | `u209357671_course_bts` |
| `DB_PASSWORD` | Diisi sendiri, tidak dikirim ke chat atau GitHub |

## Tempat memasukkan password

Untuk pengujian dari komputer ini, file `platform/.env.local` sudah dibuat dari template, dengan password kosong. Jika file sebelumnya sudah ada, setup mempertahankan isinya. Isi baris berikut di file tersebut:

```dotenv
DB_PASSWORD="MASUKKAN_PASSWORD_ANDA_DI_SINI"
```

Tanda kutip membantu menjaga karakter `#` dan spasi. Bila password mengandung tanda kutip, gunakan jenis kutip yang tidak ada dalam password atau sesuaikan escape sesuai format `.env` Node.js. Password dibaca apa adanya, tidak di-trim dan tidak diinterpolasi melalui shell oleh script.

File `.env.local` diabaikan Git. Jangan memasukkan password ke `.env.example`, file TypeScript, `package.json`, URL repository, atau perintah terminal. Jangan memakai awalan `NEXT_PUBLIC_` untuk variabel database.

Saat aplikasi Node.js sudah siap di Hostinger, buka pengaturan **Environment variables** aplikasi dan buat variabel sesuai tabel di atas. Masukkan password sebagai nilai `DB_PASSWORD` **tanpa tanda kutip pembungkus**. Tambahkan juga `DB_POOL_LIMIT=3`, `DB_SSL_MODE=required`, serta konfigurasi CA jika diperlukan. File `.env.local` tidak ikut GitHub, sehingga nilainya tidak otomatis tersedia pada hosting. Environment proses memiliki prioritas terhadap nilai file pada perintah CLI Node.js.

## Periksa koneksi terlebih dahulu

Jalankan dari direktori `platform`, menggunakan Node.js 22.13 atau lebih baru:

```sh
npm run db:check
```

Perintah ini hanya membaca versi server, nama database aktif, dan status TLS. Tidak membuat tabel atau mengubah data. Password kosong menghasilkan petunjuk pengisian sebelum koneksi dibuka.

Jika mencoba dari komputer lokal, hPanel **Remote MySQL** perlu mengizinkan alamat IP publik komputer tersebut. Gunakan alamat IP sumber yang spesifik; tidak perlu membuka akses semua host. Untuk koneksi dari aplikasi Node.js Hostinger, konfirmasikan hostname dan izin koneksi yang sesuai dengan paket Anda. [Panduan resmi Remote MySQL](https://www.hostinger.com/support/1583546-how-to-set-up-remote-mysql-access-in-hostinger/).

## TLS koneksi database

Default `DB_SSL_MODE=required` mewajibkan TLS dan memverifikasi sertifikat serta hostname; koneksi tidak otomatis turun ke plaintext. Bila Hostinger menyediakan CA khusus, masukkan sertifikat CA PEM yang sudah diubah menjadi base64 satu baris pada `DB_SSL_CA_BASE64`.

Jika muncul kesalahan TLS, konfirmasikan dukungan TLS, CA dan hostname database kepada Hostinger. Sertifikat yang diterbitkan untuk hostname belum tentu cocok dengan alamat IP. Jangan menonaktifkan verifikasi sertifikat untuk mengatasi kesalahan. `DB_SSL_MODE=disabled` hanya untuk koneksi lokal/jaringan privat yang sudah dikonfirmasi, termasuk database sementara CI; bukan solusi default untuk koneksi internet ke IP publik.

## Menerapkan struktur tabel

Foundation ditargetkan untuk **MariaDB 10.11 atau lebih baru**; uji CI menggunakan MariaDB 10.11. Hasil `db:check` membantu memastikan versi hosting sebelum penerapan.

Pada database kosong yang dibuat khusus untuk platform, jalankan:

```sh
npm run db:migrate:mariadb -- --apply
```

Perintah membuat 19 tabel platform dan satu tabel riwayat migrasi. Tidak membuat database baru, tidak mengimpor data D1, tidak mengisi akun owner, dan tidak menghapus data. Nama database mengikuti `DB_NAME`. Tidak ada data atau akun uji CI yang dipindahkan ke Hostinger.

Runner memakai lock pada database agar dua proses tidak menjalankan migrasi bersamaan, memeriksa hash migrasi yang sudah diterapkan, dan menolak database yang sudah berisi tabel tanpa riwayat STEM. Pengulangan setelah migrasi sukses tidak mengulang pembuatan tabel. Jangan mengedit SQL migrasi yang sudah diterapkan; buat migrasi baru untuk perubahan skema.

DDL MariaDB dapat melakukan commit implisit. Jika penerapan gagal di tengah jalan, sebagian tabel dapat tertinggal. Runner tidak menghapusnya atau berpura-pura rollback; tinjau hasil dan backup sebelum perbaikan. Untuk database yang sudah berisi data, lakukan backup dan uji migrasi di salinan terlebih dahulu.

SQL ada di `mariadb/0000_big_captain_marvel.sql`. Jalankan melalui runner agar riwayat tercatat; mengimpor file SQL langsung lewat phpMyAdmin tidak membuat riwayat runner. Migrasi D1 pada folder `drizzle/` tetap terpisah.

## Status integrasi aplikasi

Sudah disiapkan: driver `mysql2`, konfigurasi koneksi Node.js, skema Drizzle MariaDB, SQL migrasi, pengecekan koneksi, pengelolaan migrasi, dan pengujian CI pada database sementara.

**Aplikasi utama masih memakai D1.** Modul `db/mariadb.ts` belum menjadi pengganti `lib/server.ts` atau API peserta. Pengelolaan akses pada `lib/access.ts` sudah memiliki query D1 dan MariaDB, dengan antarmuka bersama pada `lib/database.ts`. Modul MariaDB menyediakan adapter `database` selain pool dan ORM; query dipilih secara eksplisit, bukan diterjemahkan melalui regex saat dijalankan.

Adapter menggunakan prepared statements, transaksi untuk batch, dan named lock per database untuk mempertahankan serialisasi penulisan D1. Insert duplikat yang tidak mengubah data melaporkan nol, sehingga konflik versi dan audit tetap dapat dikenali. Koneksi dengan kegagalan rollback atau pelepasan lock tidak dikembalikan ke pool. Serialisasi ini merupakan pilihan awal untuk menjaga aturan akses/kuota; skalabilitas penulisan perlu ditinjau sebelum trafik besar.

Port query course/profil/progres/kelas/tugas/coding, autentikasi dan runtime produksi masih diperlukan. Mengisi password saja belum menyelesaikan migrasi platform. Pengujian MariaDB tambahan mencakup persetujuan bersamaan dan rollback audit; hasilnya harus diverifikasi melalui CI, terpisah dari tes unit yang memakai SQLite atau pool palsu.

Koneksi ke database Hostinger belum diverifikasi karena password diisi manual oleh pengguna. Hasil pengujian CI tidak membuktikan hostname, izin akun, TLS atau jaringan Hostinger sudah benar.

Implementasi database Node.js tidak diimpor oleh halaman browser maupun runtime Site saat ini. Pengujian CI tidak menggunakan password atau server Hostinger; fixture hanya boleh berjalan pada host `127.0.0.1` dengan nama database `stem_ci`.
