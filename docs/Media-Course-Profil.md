# Upload materi dan foto profil

Fitur tersedia pada aplikasi lokal Ruang STEM. Migrasi tambahan `media_files` telah diterapkan di MariaDB Hostinger; aplikasi belum di-deploy. Metadata tersimpan di Hostinger, sedangkan isi berkas berada di komputer lokal pada penyimpanan privat yang sama dengan lampiran tugas.

## Foto profil

Buka Profil, pilih PNG/JPEG maksimal 2 MiB. Foto langsung disimpan tanpa menunggu tombol simpan biodata; perubahan teks profil tetap dipertahankan. Hapus foto untuk kembali ke avatar inisial. Penggantian dari tab dengan foto lama ditolak agar tidak menimpa perubahan terbaru; muat ulang untuk mengambil foto terkini.

Foto hanya dapat dibaca pemilik akun. Foto belum ditampilkan kepada pengguna lain pada diskusi atau kelas. Gambar diperiksa dan diproses ulang, metadata dibuang, serta ukurannya diperkecil maksimal 512 piksel. Foto lama yang sudah diganti dibersihkan.

## Materi course

Super Admin menyimpan course terlebih dahulu, kemudian membuka editor materi. Blok Gambar menerima PNG/JPEG; blok Dokumen menerima PDF/TXT. Maksimal 5 MiB per berkas. Gambar diproses ulang hingga maksimal 2048 piksel. Video tetap memakai URL; upload video, DOCX dan ZIP belum tersedia.

Daftar berkas course memungkinkan penggunaan ulang berkas serta penghapusan berkas yang belum digunakan. Simpan perubahan course agar blok tersedia pada materi. Berkas yang pernah disimpan dalam materi dipertahankan untuk mencegah penghapusan saat proses penyimpanan berlangsung; batas setiap pengunggah pada satu course adalah 100 berkas/200 MiB. Menghapus blok tidak otomatis menghapus berkas tersebut.

Super Admin dapat melihat berkas draft. Pengguna lain hanya dapat mengakses berkas yang masih dirujuk pada materi course terbit dan sudah terbuka sesuai prasyarat belajar. Membuka URL dokumen secara langsung tidak melewati kunci materi. Satu berkas yang dipakai pada beberapa materi tersedia jika setidaknya salah satu materi tersebut sudah terbuka.

## Penyimpanan dan pemeriksaan

Ikuti konfigurasi `UPLOAD_STORAGE_DIR`, `UPLOAD_STORAGE_ID` dan `APP_URL` pada `Upload-Berkas.md`. Produksi memerlukan direktori privat persisten di luar checkout aplikasi. Scope origin memisahkan berkas lokal dan hosting; migrasi metadata saja tidak memindahkan isi berkas. Backup harus mencakup database dan direktori privat. Jangan deploy atau mengubah konfigurasi hosting sebelum diminta.

API memeriksa sesi aktif, kebijakan email, origin untuk perubahan, batas ukuran aktual dan akses pada setiap unduhan. Upload berbagi pembatas percobaan dengan lampiran tugas. PDF diperiksa secara dasar, bukan melalui pemindai malware. Unduhan memakai respons privat tanpa cache, `nosniff`, dan sandbox.

114 tes lokal dan TypeScript lulus. Empat skenario materi/foto juga lulus pada MariaDB Hostinger dalam transaksi rollback; jumlah baris terkait tetap dan berkas sintetis dibersihkan. Pratinjau komponen asli diperiksa dengan data contoh pada desktop dan mobile. Suite integrasi MariaDB/HTTP CI penuh dan UAT akun sungguhan belum dijalankan pada tahap ini. Lint modul baru lulus; lint repository memiliki temuan lama.

## UAT dengan akun sungguhan

1. Upload foto valid, ganti, hapus, lalu coba gambar rusak, PDF dan gambar di atas 2 MiB. Biodata yang belum disimpan harus tetap utuh saat mengganti foto.
2. Buka profil pada dua tab. Ganti foto pada tab pertama, lalu coba mengganti/menghapus dari tab lama: perubahan terbaru harus terlindungi.
3. Coba URL foto melalui akun lain dan tanpa login: akses harus ditolak.
4. Admin upload gambar dan PDF/TXT pada course uji, simpan, gunakan ulang melalui daftar berkas, dan hapus berkas belum digunakan. Coba tindakan tersebut sebagai Siswa/Tutor: akses pengelolaan harus ditolak.
5. Siswa membuka dokumen materi yang terkunci melalui URL langsung: akses harus ditolak. Selesaikan prasyarat, lalu unduh kembali.
6. Revisi prasyarat wajib hingga progres menjadi tidak berlaku, batalkan penerbitan course, atau hapus referensi blok: akses siswa harus mengikuti keadaan terbaru.
7. Periksa formulir, tautan unduh, pesan gagal dan penggunaan keyboard pada ponsel/desktop. Catat temuan pada template UAT.
