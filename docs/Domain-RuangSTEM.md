# Menggunakan ruangstem.com untuk aplikasi course

Tujuan: pengunjung membuka `https://ruangstem.com` dan tetap berada di domain tersebut saat login, membuka kelas, dan belajar. Aplikasi dan MariaDB tetap di hosting yang sekarang melayani `https://course.ypi-baitussalam.or.id`. Tidak perlu menggandakan aplikasi atau database.

Status persiapan: source mendukung domain publik melalui `APP_URL`. Contoh environment sudah diarahkan ke `https://ruangstem.com`. Panduan ini bukan konfirmasi bahwa DNS, pemetaan domain, SSL, atau environment produksi sudah diubah. IP/record tujuan wajib diambil dari panel hosting aplikasi.

## 1. Bedakan akun domain dan akun aplikasi

- Akun A: akun pengelola domain `ruangstem.com`.
- Akun B: akun hosting aplikasi `course.ypi-baitussalam.or.id`.

Buka dua profil browser agar tidak tertukar. Simpan salinan record DNS sebelum mengeditnya. Pilih website course di akun B; jangan memilih website utama `ypi-baitussalam.or.id`.

## 2. Hubungkan domain tambahan ke aplikasi yang sama

Di akun B, buka Websites → dashboard aplikasi course. Jika tersedia, buka Domains → Parked Domains / Domain alias, masukkan `ruangstem.com`, lalu pilih Park. Pastikan domain tambahan dilayani oleh aplikasi Node.js course, bukan halaman website utama atau folder statis lain.

Hostinger mendokumentasikan parked domain untuk menampilkan konten yang sama sambil mempertahankan alamat browser. Namun dokumentasi umum tersebut belum memastikan fitur ini tersedia pada pemasangan Node.js kita yang memakai subdomain. Jika menu tidak tersedia atau tujuan aplikasi tidak jelas, gunakan bantuan Hostinger. Jangan menggunakan Change domain jika alamat course lama wajib dipertahankan sebagai alamat upstream.

Teks untuk dikirim sendiri ke dukungan Hostinger:

> Saya memiliki aplikasi Next.js/Node.js pada course.ypi-baitussalam.or.id. Saya ingin menambahkan ruangstem.com sebagai domain alias ke aplikasi yang sama, dengan URL browser tetap ruangstem.com. Domain ada di akun Hostinger lain yang juga saya kelola. Mohon bantu pemetaan domain ke aplikasi Node.js yang sama, verifikasi kepemilikan, SSL, serta berikan record DNS yang diperlukan. Saya ingin mempertahankan aplikasi dan database yang sekarang. Apakah alias pada pemasangan ini didukung?

Jika alias tidak didukung, custom domain dapat menggantikan alamat publik aplikasi yang sama jika alamat lama tidak perlu dipertahankan. Jika alamat lama wajib tetap menjadi upstream, diperlukan reverse proxy tersendiri yang mendukung HTTPS; ini perlu konfigurasi terpisah, bukan cukup satu record DNS. Tidak ada proxy yang dipasang oleh panduan ini.

## 3. Verifikasi kepemilikan lintas akun

Saat panel akun B meminta verifikasi domain, salin TXT yang diberikannya. Di pengelola DNS aktif `ruangstem.com` (akun A jika nameserver-nya dikelola Hostinger), tambahkan:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| TXT | `@` | Nilai verifikasi persis dari akun B | `900` |

Ikuti nilai panel jika berbeda. Jangan mengganti TXT lain seperti SPF. Kembali ke akun B dan lanjutkan verifikasi; propagasi dapat membutuhkan hingga 24 jam. Jika DNS aktif dikelola Cloudflare atau penyedia lain, record harus ditambahkan di sana.

## 4. Arahkan DNS web

Ambil petunjuk DNS dari panel/dukungan akun B setelah domain dipetakan ke aplikasi yang benar. Bila metode yang diberikan adalah A record:

| Type | Name | Tujuan |
| --- | --- | --- |
| A | `@` | IP aplikasi yang diberikan akun B |

Untuk `www`, ikuti record yang diberikan panel; bisa A atau CNAME. Jika meminta CNAME ke domain utama, gunakan `ruangstem.com`, tanpa `https://` dan tanpa `/`. Ganti hanya record web yang konflik untuk nama yang sedang diatur, termasuk AAAA lama jika mengarah ke server lain. Pertahankan MX, SPF, DKIM, DMARC, dan TXT verifikasi. Bila Hostinger CDN mengelola record tersebut, ikuti alur CDN/panel sebelum mengubahnya secara manual.

Jangan memasukkan URL `https://course.ypi-baitussalam.or.id/` ke A record: A record memerlukan IP. Mengarahkan DNS saja tidak membuat hosting mengenali domain baru. Cara A record mempertahankan pengelola DNS yang sekarang, sehingga nameserver tidak perlu diganti hanya karena beda akun.

## 5. Aktifkan HTTPS

Pastikan sertifikat SSL untuk `ruangstem.com` aktif di hosting yang melayani aplikasi. Sertifikat untuk `course.ypi-baitussalam.or.id` tidak mencakup `ruangstem.com`. Tambahkan pemetaan dan sertifikat `www.ruangstem.com` juga jika alamat tersebut akan digunakan.

Buka `https://ruangstem.com/login`. Halaman harus tampil tanpa peringatan sertifikat dan tanpa berpindah ke domain lama. Pada tahap ini pengiriman formulir bisa belum bekerja sampai langkah 6 selesai.

## 6. Terapkan domain publik pada aplikasi

Di akun B → dashboard aplikasi Node.js → Environment variables, ubah satu variabel:

```dotenv
APP_URL=https://ruangstem.com
```

Klik Apply changes dan tunggu proses penerapan selesai. Menurut panduan Hostinger, perubahan environment dapat diterapkan tanpa full redeploy; jika panel meminta restart/redeploy, ikuti alurnya. Mengedit `.env.example` lokal saja tidak mengubah hosting. Biarkan `DB_*` dan kredensial yang sudah bekerja tetap seperti semula. `AUTH_ALLOW_LOCAL_HTTP` tetap `false` untuk produksi.

Aplikasi menggunakan APP_URL untuk memeriksa Origin pada login dan operasi tulis, membuat tautan undangan tutor, serta menentukan cookie HTTPS. Link navigasi dan endpoint formulir menggunakan path relatif. Cookie sesi tidak mengunci atribut Domain ke domain lama; pengguna perlu login kembali pada domain baru.

Saat APP_URL menjadi ruangstem.com, login/operasi tulis melalui alamat course lama ditolak oleh pemeriksaan Origin. Ini konfigurasi satu domain publik. Untuk pengunjung gunakan ruangstem.com. Jika diperlukan login aktif pada kedua domain sekaligus, perlu perubahan kebijakan origin tersendiri dan pengujian tambahan.

## 7. Uji hasil

1. Buka `https://ruangstem.com/courses` dan `https://ruangstem.com/login` di jendela privat.
2. Login dengan akun yang sudah ada, lalu buka dashboard, profil, kelas, dan materi. Alamat harus tetap ruangstem.com pada setiap langkah.
3. Muat ulang dashboard untuk memastikan sesi tersimpan; uji logout kemudian login ulang.
4. Simpan perubahan profil yang kecil dan kembalikan lagi. Ini menguji operasi tulis tanpa membuat course atau akun contoh pada data produksi.
5. Pastikan jumlah/isi course dan akun tetap berasal dari database yang sama.
6. Setelah pemetaan dan SSL www siap, atur redirect www ke `https://ruangstem.com`, dengan path dan query tetap dipertahankan. DNS CNAME sendiri tidak menghasilkan redirect. Jangan arahkan ruangstem.com ke alamat course lama karena alamat browser akan berubah.

Pengujian source lokal tidak menggantikan langkah ini: hasil end-to-end memerlukan DNS, SSL, pemetaan hosting, dan environment produksi yang benar.

## Jika belum bekerja

| Gejala | Pemeriksaan |
| --- | --- |
| Halaman parkir, 404 hosting, atau website utama yang muncul | Periksa pemetaan alias ke aplikasi course dan DNS, bukan hanya IP yang sama. |
| Alamat berpindah ke course.ypi-baitussalam.or.id | Ada redirect di hosting/proxy; gunakan pemetaan alias ke aplikasi yang sama. |
| Login menampilkan “Asal permintaan tidak valid” | Pastikan APP_URL pada proses aplikasi sudah `https://ruangstem.com`; buka domain tanpa www. |
| Peringatan sertifikat | Periksa SSL untuk ruangstem.com dan record A/AAAA yang konflik. |
| Halaman tampil tetapi perubahan gagal | Periksa origin, cookie sesi, dan koneksi database; jangan melonggarkan pemeriksaan keamanan. |

Jika perlu membatalkan penerapan, kembalikan APP_URL ke nilai sebelumnya dan terapkan melalui panel, lalu pulihkan record DNS yang memang diubah dari salinan awal. Jangan menghapus aplikasi, database, atau domain sebagai langkah pemulihan.

## Referensi resmi

- [Parked domain, subdomain, dan redirect](https://www.hostinger.com/support/1583424-what-are-the-differences-between-subdomain-parked-domain-and-add-on-domain/)
- [Memasang parked domain](https://www.hostinger.com/support/1583404-how-to-park-a-domain-at-hostinger/)
- [Verifikasi domain lintas akun](https://www.hostinger.com/support/4771440-how-to-verify-domain-ownership-at-hostinger/)
- [Domain untuk aplikasi Node.js](https://www.hostinger.com/support/how-to-connect-a-custom-domain-to-a-node-js-application/)
- [Mengubah environment aplikasi Node.js](https://www.hostinger.com/support/how-to-edit-or-add-environment-variables-after-deployment/)
