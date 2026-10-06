# Judge0 untuk STEM Studio

## Pilihan hosting

Website STEM Studio tetap menggunakan hosting sekarang. Penilaian resmi mengirim kode dari backend website ke mesin Judge0 melalui HTTPS; API key tidak dikirim ke browser peserta.

Shared hosting biasa umumnya tidak cukup: instalasi resmi memakai Linux, Docker, konfigurasi cgroup, dan container privileged. Gunakan VPS Linux dengan akses administrator yang mengizinkan konfigurasi tersebut, dedicated server, atau mesin Linux terpisah untuk uji lokal. VPS yang hanya menyediakan container tanpa kontrol kernel belum tentu cocok. Raspberry Pi/ARM tidak menjadi pilihan awal untuk image resmi; periksa dukungan image dan arsitektur sebelum menggunakannya.

Untuk pilot kecil, **2 vCPU, RAM 4 GB, SSD 30–40 GB** merupakan titik awal perencanaan saya, bukan spesifikasi minimum resmi atau jaminan kapasitas. Mulai dengan dua worker dan ukur beban. Belum ada kebutuhan membeli VPS untuk latihan browser.

## Persiapan di VPS

1. Sediakan VPS khusus runner, dengan Ubuntu 22.04 sesuai panduan rilis yang dirujuk. Jangan letakkan database siswa, kredensial website, atau layanan penting lain pada mesin sandbox ini.
2. Instal Docker Engine dan plugin Docker Compose mengikuti [dokumentasi Docker Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Pastikan `docker compose version` bekerja.
3. Ikuti konfigurasi kernel/cgroup dalam [panduan rilis resmi Judge0](https://github.com/judge0/judge0/blob/master/CHANGELOG.md#v1131-2024-04-18). Perubahan GRUB memerlukan reboot dan sebaiknya dilakukan lewat console VPS. Jangan mengubah kernel komputer utama untuk mencoba aplikasi.
4. Gunakan rilis yang telah ditinjau dan dipatch. **Jangan gunakan versi 1.13.0 atau lebih tua**, yang memiliki kerentanan kritis. Contoh berikut memakai rilis 1.13.1; sebelum deployment nyata, cek [rilis terbaru](https://github.com/judge0/judge0/releases) dan advisori keamanan, lalu pin versi/digest yang diverifikasi.

## Unduh dan konfigurasi

Di terminal VPS, unduh arsip dari rilis resmi dan cocokkan checksum dengan checksum tepercaya bila tersedia:

```sh
mkdir -p ~/stem-judge
cd ~/stem-judge
curl -fLO https://github.com/judge0/judge0/releases/download/v1.13.1/judge0-v1.13.1.zip
unzip judge0-v1.13.1.zip
cd judge0-v1.13.1
```

Edit `judge0.conf`. Ganti tiga placeholder rahasia berikut dengan nilai acak yang berbeda dari password manager. Jangan commit atau mengirimnya ke chat:

```ini
REDIS_PASSWORD=GANTI_DENGAN_RAHASIA_ACAK
POSTGRES_PASSWORD=GANTI_DENGAN_RAHASIA_ACAK_LAIN
AUTHN_HEADER=X-Auth-Token
AUTHN_TOKEN=GANTI_DENGAN_TOKEN_API_ACAK
ENABLE_BATCHED_SUBMISSIONS=true
MAX_SUBMISSION_BATCH_SIZE=8
ENABLE_NETWORK=false
ALLOW_ENABLE_NETWORK=false
ENABLE_CALLBACKS=false
ENABLE_ADDITIONAL_FILES=false
ENABLE_COMPILER_OPTIONS=false
ENABLE_COMMAND_LINE_ARGUMENTS=false
ENABLE_SUBMISSION_DELETE=false
COUNT=2
MAX_QUEUE_SIZE=40
```

Gunakan [konfigurasi resmi](https://github.com/judge0/judge0/blob/v1.13.1/judge0.conf) sebagai acuan semua opsi. Backend STEM Studio juga mengirim batas CPU 2 detik, wall time 5 detik, memori 64.000 KB, file 64 KB, 16 proses/thread, dan satu eksekusi per test. Tetapkan batas maksimum pada layanan sesuai kebutuhan kelas; egress firewall menambah lapisan isolasi.

Dalam `docker-compose.yml`:

- Pin image `server` dan `workers` ke rilis yang sama, misalnya `judge0/judge0:1.13.1`, kemudian verifikasi versi runtime. Hindari tag `latest` pada produksi.
- Ubah port server dari `2358:2358` menjadi `127.0.0.1:2358:2358`.
- Biarkan PostgreSQL dan Redis hanya di jaringan internal Docker.
- Pengaturan privileged dalam compose resmi adalah alasan mesin ini harus khusus sandbox; jangan memasang container ke server website utama.

```sh
chmod 600 judge0.conf
sudo docker compose up -d db redis
sudo docker compose logs --tail=50 db redis
# Setelah database dan Redis siap:
sudo docker compose up -d
sudo docker compose ps
```

Periksa log jika worker belum siap. Jangan mempublikasikan isi konfigurasi atau log yang berisi token.

## HTTPS

Buat DNS subdomain, misalnya `judge.domain-anda.id`, ke VPS. Pasang reverse proxy HTTPS, misalnya [Caddy](https://caddyserver.com/docs/install). Contoh Caddyfile untuk Caddy yang berjalan pada host:

```caddyfile
judge.domain-anda.id {
    reverse_proxy 127.0.0.1:2358
}
```

Buka 443/80 untuk HTTPS dan penerbitan sertifikat; batasi SSH ke administrator. Port 2358, Redis, dan PostgreSQL tidak boleh dapat diakses publik. AUTHN_TOKEN tetap wajib, meskipun sudah menggunakan HTTPS. Terapkan pembatasan request di proxy dan monitor antrean. Bila memakai proxy dalam container, alamat upstream perlu disesuaikan dengan jaringan container.

## Hubungkan ke STEM Studio

Operator mengatur environment **hosting produksi**; perubahan `.env.example` tidak mengubah situs live:

```ini
JUDGE0_URL=https://judge.domain-anda.id
JUDGE0_TOKEN=TOKEN_YANG_SAMA_DENGAN_AUTHN_TOKEN
JUDGE0_ENABLED=true
JUDGE0_PYTHON_ID=71
JUDGE0_JAVASCRIPT_ID=63
JUDGE0_CPP_ID=54
```

Tandai `JUDGE0_TOKEN` sebagai secret. Verifikasi ID dari `/languages`, karena instalasi berbeda dapat memiliki daftar berbeda. Endpoint harus DNS publik, HTTPS tanpa kredensial/query/redirect. Adapter koneksi privat perlu dibuat terpisah jika layanan tidak dapat diakses melalui internet. Untuk provider RapidAPI, gunakan secret `JUDGE0_API_KEY` dan `JUDGE0_API_HOST` yang cocok dengan hostname endpoint, bukan memasukkan key ke URL.

Terbitkan ulang agar konfigurasi diterapkan. Di **Kelola course → Pemeriksa kode**, jalankan pemeriksaan konfigurasi dasar. Pemeriksaan ini memeriksa versi, pengaturan jaringan, dan ID bahasa; belum membuktikan seluruh isolasi sandbox.

Sebelum mengundang siswa, uji solusi benar/salah, kesalahan kompilasi/runtime, loop tanpa akhir, output berlebihan, upaya akses jaringan, pengiriman bersamaan, dan test tersembunyi. Pastikan kegagalan layanan mengembalikan kuota tepat sekali, hasil revisi lama tidak membuka materi baru, dan token/kunci tes tidak ada di API browser. Simulasi adapter yang tersedia di repository tidak menggantikan pengujian mesin Judge0 nyata.

## Pilihan tanpa VPS dulu

Tombol **Coba gratis di browser** menjalankan Python/Pyodide atau JavaScript pada iframe tanpa akses origin website dan Web Worker yang dapat dihentikan. Runtime Python diunduh dari CDN pertama kali. Hanya contoh pengujian publik yang digunakan; hasil dapat dimanipulasi di komputer peserta sehingga tidak disimpan sebagai nilai resmi. Batas waktu browser mencakup pemuatan runtime; batas memori server tidak tersedia. C++ dan tes coding wajib tetap memerlukan pemeriksa server atau keputusan mentor. Pengaturan saat ini belum memberikan kelulusan coding manual oleh mentor.
