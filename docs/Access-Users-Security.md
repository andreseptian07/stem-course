# Akses pengguna dan keamanan STEM Studio

Akses memiliki dua lapisan: izin mengunjungi Site melalui pengaturan berbagi Sites, lalu persetujuan akun belajar melalui `/access`. Menyetujui akun tidak mengundang pengguna ke Site. Status akun juga tidak memberikan peran editor Site atau admin course.

## Menjalankan kelas percobaan

1. Pemilik masuk ke Site privat terlebih dahulu dan membuka `/access`. Identitas pemilik disimpan pada settings; inisialisasi otomatis ditutup permanen setelah pemilik terikat. Jangan memperluas audience sebelum langkah ini selesai. Set `OWNER_SETUP_ENABLED=false` melalui pengaturan runtime setelah verifikasi pemilik, lalu terbitkan ulang untuk menerapkannya.
2. Pilih email peserta/mentor yang akan diundang. Tambahkan mereka sebagai viewer Site, bukan editor, melalui kontrol berbagi Sites. Penambahan viewer eksternal dapat mengirim email undangan; perlu instruksi pemilik untuk penerima yang spesifik. Hindari publikasi terbuka sebelum menguji akun nyata.
3. Pengguna masuk menggunakan ChatGPT. Akun baru berstatus **Menunggu persetujuan** dan hanya dapat melihat status akun sendiri serta ringkasan katalog.
4. Pemilik membuka **Kelola akses**, menyetujui akun, dan mengisi alasan. Pengguna memuat ulang halaman Akses akun lalu membuka dashboard.
5. Pemilik menugaskan mentor melalui pengaturan kelas dan menyetujui peserta kelas. Persetujuan akun platform dan keanggotaan kelas adalah dua keputusan terpisah.
6. Uji dengan akun mentor dan peserta yang berbeda: privasi tugas/feedback, kuis wajib, status review, dan penangguhan akses. Pengujian lokal memakai mock sign-in; tidak menggantikan uji multiakun produksi.

## Peran dan pembatasan

| Operasi                               | Pemilik     | Peserta aktif        | Mentor aktif          |
| ------------------------------------- | ----------- | -------------------- | --------------------- |
| Membuat atau mengubah course          | Ya          | Tidak                | Tidak                 |
| Menyetujui atau menangguhkan akun     | Ya          | Tidak                | Tidak                 |
| Mengelola penugasan dan peserta kelas | Ya          | Tidak                | Tidak                 |
| Membaca materi terbit                 | Ya          | Ya                   | Ya                    |
| Membaca diskusi/meeting kelas         | Semua kelas | Kelas yang disetujui | Kelas yang ditugaskan |
| Review tugas dan feedback pribadi     | Semua kelas | Hanya milik sendiri  | Kelas yang ditugaskan |

Mentor merupakan penugasan kelas, bukan role admin global. Akun yang ditangguhkan ditolak pada permintaan API belajar berikutnya meskipun masih memiliki cookie login yang valid atau penugasan mentor. Permintaan yang sudah berjalan dapat selesai; materi yang telah diterima browser tidak dapat ditarik kembali. Penangguhan tidak menghapus progres, keanggotaan, atau pekerjaan. Pulihkan akun untuk mengembalikan akses; hapus penugasan/keanggotaan secara terpisah jika tidak ingin memulihkan hak kelas tersebut.

Pemilik tidak dapat menangguhkan dirinya sendiri dari aplikasi. Hanya settings.owner yang menentukan pemilik; role dari browser, isian profil, atau tabel users tidak dapat mengubahnya. Akun lama selain pemilik tanpa user_access memerlukan persetujuan ulang. Tabel akses dan audit ditambahkan melalui migrasi `0005`, tanpa backfill otomatis atau penghapusan data.

## Proteksi yang diterapkan

- Identitas berasal dari gateway Sites dan SIWC; local mock sign-in hanya digunakan oleh preview. Jangan mengekspos Worker secara langsung tanpa gateway yang memvalidasi dan menghapus header identitas dari klien.
- API belajar memeriksa persetujuan akun pada setiap permintaan. `/api/access` GET hanya memberikan status sendiri untuk peserta; daftar akun dan audit hanya untuk pemilik.
- Penulisan akses memeriksa identitas pemilik tersimpan, origin, jenis/ukuran body, schema strict, dan versi. Audit dan perubahan status dijalankan dalam satu transaksi; kehilangan audit membatalkan perubahan.
- API menolak `Sec-Fetch-Site: cross-site`; pemeriksaan origin tetap dipakai untuk POST. Header `nosniff`, referrer `no-referrer`, pembatasan kamera/mikrofon/lokasi, dan `private, no-store` pada halaman akun/API membantu mengurangi kebocoran data dan penggunaan fitur browser yang tidak diperlukan.
- Session, password, MFA dan logout dikelola penyedia login ChatGPT/Sites. Aplikasi tidak membuat password baru, tidak mencabut session penyedia secara global, dan tidak menambahkan sistem JWT/password sendiri.

Batas tahap ini: belum ada uji penetrasi independen, monitoring keamanan operasional, backup/restore teruji, moderasi lengkap, atau uji beban multiakun. CSP dan kebijakan frame perlu dirancang terpisah dengan memperhatikan iframe video, runtime latihan browser, dan embed Sites agar tidak memutus fitur yang ada. Judge0 belum dikonfigurasi; hardening akun tidak mengaktifkan penilaian kode server.

## Verifikasi lokal

`tests/access.test.mjs` memeriksa pemilik tetap, bootstrap tertutup, persetujuan/penangguhan/pemulihan, penolakan role palsu, status akun lama, konflik versi dan rollback audit. `node tests/access-api.mjs` hanya untuk localhost dan fixture `access-demo-local`; memeriksa login, origin, pemalsuan header, larangan menangguhkan pemilik, persistensi audit dan header keamanan.
