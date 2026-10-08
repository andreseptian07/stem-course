# Pengujian manual Tim Kurikulum

**Lingkungan pengujian:** https://ruangstem.com/curriculum pada rilis Tim Kurikulum — 8 Oktober 2026, dengan database Hostinger. Catat SHA deployment pada lembar hasil dan pastikan menu tersedia sebelum mulai.

## Menambahkan anggota

1. Masuk sebagai Super Admin. Dari **Dashboard → Tim Kurikulum**, pilih course yang sudah disimpan. Menu juga tersedia melalui **Kelola akses → Kelola Tim Kurikulum**.
2. Pada bagian **Anggota Tim Kurikulum**, pilih akun aktif dan tekan **Tambahkan anggota**. Ulangi untuk beberapa orang.
3. Tutor yang dipilih tetap dapat mengajar sesuai penugasan kelasnya. Untuk penyusun khusus, orang tersebut mendaftar akun biasa; Admin mengaktifkan akun melalui Kelola akses, lalu menugaskannya ke course. Akun tersebut dikenali sebagai **Tim Kurikulum**, tanpa harus diangkat menjadi Tutor.
4. Anggota membuka **Dashboard → Tim Kurikulum**, membuat atau membuka draf, menambahkan materi/blok/kuis/latihan, lalu menyimpan perubahan.
5. Setelah selesai, tekan **Ajukan untuk review**. Editor terkunci selama review; isi draf tetap dapat dibaca.
6. Admin membaca seluruh materi, kuis beserta jawaban, dan latihan beserta test case. **Periksa materi sekarang** membantu membandingkan isi draf dengan course saat ini.
7. Admin dapat **Minta perbaikan** dengan catatan, atau **Setujui & terapkan materi → Konfirmasi persetujuan**. Persetujuan mengganti materi course; hanya materi yang berubah mendapat revisi baru.

Course yang belum diterbitkan tetap belum terlihat siswa setelah persetujuan draf. Admin mengatur status publikasi melalui Kelola course. Status publikasi dan tanda course contoh tetap dikelola Admin.

## Persiapan putaran

Siapkan Admin, Tutor A, Tutor B, Penyusun Q1, Penyusun Q2, dan Siswa A. Q1/Q2 tidak diberi undangan Tutor atau penugasan mengajar. Semua akun aktif. Siapkan course uji C1 dan C2 dengan nama berawalan UAT; C1 terbit dan mempunyai materi yang sudah diselesaikan Siswa A. Jangan gunakan course nyata.

Admin menugaskan Tutor A dan Q1 ke C1; Tutor B dan Q2 ke C2. Gunakan browser/profil terpisah. Persetujuan draf memperbarui materi course pada web dan database bersama. Koordinator harus menentukan course uji dan waktu pengujian. Jalankan siklus ini sesudah baseline progres/sertifikat tercatat (fase 6A pada dokumen 05), kemudian uji pencabutan anggota pada fase 7.

## Kasus pengujian

| ID | Pelaksana dan langkah | Hasil yang diharapkan |
| --- | --- | --- |
| CUR-01 | Admin membuka Dashboard dan Kelola akses. | Tautan Tim Kurikulum terlihat; workspace menampilkan course yang ada. |
| CUR-02 | Admin menambahkan Tutor A dan Q1 ke C1. | Kedua anggota muncul; Tutor ditandai Tutor & penyusun, Q1 penyusun kurikulum. |
| CUR-03 | Q1 masuk ulang dan membuka Dashboard. | Akun dikenali sebagai Tim Kurikulum; menu workspace terlihat. Q1 tidak mendapat hak mengajar/review tugas siswa. |
| CUR-04 | Admin mencari akun yang masih pending/suspended pada pilihan tambah anggota. | Akun yang tidak aktif tidak dapat diberi penugasan baru; harus diaktifkan lebih dahulu. |
| CUR-05 | Tutor A/Q1 membuka workspace; Tutor B/Q2 membuka workspace masing-masing. | Kelompok pertama hanya melihat C1 dan kelompok kedua hanya C2. Akun biasa yang belum ditugaskan mendapat keadaan kosong. |
| CUR-06 | Q1/Tutor A mencoba URL Kelola course, laporan Admin dan review pekerjaan kelas yang tidak ditangani. | Hak kurikulum tidak membuka fitur Admin atau data siswa; hak Tutor tetap dibatasi penugasan kelasnya. |
| CUR-07 | Q1 membuat draf C1, mengubah judul materi dan isi blok, lalu menyimpan. Siswa A membuka C1. | Draf tersimpan; judul dan isi yang dilihat siswa masih versi course sebelum persetujuan. |
| CUR-08 | Tutor A membuka draf yang disimpan Q1 dan menambahkan materi, kuis serta latihan kode. | Anggota berbagi draf yang sama; seluruh perubahan tersimpan dan dapat dibaca anggota lain setelah muat ulang. |
| CUR-09 | Q1 mengunggah TXT/PDF atau gambar dan memasangnya pada draf. Siswa A mencoba URL berkas draf. | Anggota C1/Admin bisa membaca berkasnya; siswa belum dapat membaca berkas yang hanya ada di draf. Anggota C2 juga tidak mendapat akses berkas C1 yang tidak tersedia bagi siswa. |
| CUR-10 | Tutor A dan Q1 membuka versi draf sama. Q1 menyimpan perubahan; Tutor A menyimpan tanpa muat ulang. | Simpan kedua ditolak dengan informasi konflik. Perubahan Q1 tidak tertimpa. Tutor A menyalin perubahan sendiri sebelum muat ulang bila masih diperlukan. |
| CUR-11 | Q1 mengubah isi tanpa menyimpan; mencoba ajukan, pindah course, muat ulang, keluar atau menutup halaman. | Ajukan tidak aktif sebelum simpan; navigasi/muat ulang memberi peringatan kehilangan perubahan. Uji pilihan tetap tinggal. |
| CUR-12 | Q1 menyimpan dan mengajukan draf. | Status Menunggu review Admin; draf dapat dibaca, tetapi tidak dapat diedit atau diterapkan oleh anggota. |
| CUR-13 | Admin membuka notifikasi; anggota membuka notifikasi sesudah penugasan/pengajuan. | Pemberitahuan kurikulum mengarah ke workspace; akun tanpa penugasan tidak melihat informasi draf course tersebut. |
| CUR-14 | Admin membuka setiap materi dalam review, termasuk materi ke-2 dan latihan kode; membuka materi sekarang untuk dibandingkan. | Seluruh isi, jawaban kuis dan test tersembunyi dapat ditinjau oleh Admin/anggota berwenang; status course sekarang terlihat. |
| CUR-15 | Admin mencoba Minta perbaikan tanpa catatan, lalu menuliskan catatan dan mengirimkannya. | Tanpa catatan tombol tidak aktif. Setelah dikirim status Perlu perbaikan, catatan dan notifikasi diterima anggota. |
| CUR-16 | Q1 memperbaiki draf, menyimpan dan mengajukan kembali. | Catatan dapat ditindaklanjuti; status kembali Menunggu review Admin. Materi siswa belum berubah. |
| CUR-17 | Admin memilih Setujui & terapkan materi, membatalkan konfirmasi, kemudian mengonfirmasi persetujuan. | Pembatalan tidak mengubah course. Persetujuan menaikkan versi course dan mengganti isi dengan draf yang telah ditinjau. Materi berubah mendapat revisi baru; materi yang sama mempertahankan progres. Siswa perlu menyelesaikan ulang materi yang berubah. |
| CUR-18 | Setelah draf diajukan, Admin mengubah course melalui editor lama. Coba setujui draf lama. | Persetujuan ditolak karena versi dasar berbeda. Admin meminta perbaikan; anggota memeriksa isi terbaru sebelum mulai ulang draf. Mulai ulang mengganti isi draf lama dan meminta konfirmasi. |
| CUR-19 | Admin mencabut akses Q1 lalu Tutor A, ketika halaman anggota masih terbuka. Coba simpan/ajukan/upload dan muat ulang. | Operasi ditolak sesudah pencabutan; course menghilang dari workspace/notifikasi. Draf bersama tetap tersimpan. Hak Tutor untuk kelas yang ditangani tetap berlaku. Berkas yang juga terbit tetap mengikuti aturan akses belajar siswa. |
| CUR-20 | Ulangi alur di ponsel dan dengan keyboard; periksa riwayat perubahan dan buat draf baru setelah persetujuan. | Formulir/kontrol bisa dipakai tanpa scroll horizontal; review seluruh materi dapat dibuka. Riwayat mencatat pelaksana dan waktu. Draf baru berasal dari versi course terakhir. |

## Catatan penting untuk tim

- Draf disimpan bersama untuk satu course. Sistem menolak penyimpanan versi lama, tetapi belum menggabungkan perubahan beberapa penulis secara otomatis. Bagi tugas per materi dan koordinasikan waktu penyimpanan.
- Upload berkas yang sudah digunakan dalam draf dilindungi dari penghapusan. Pembersihan berkas course dikelola Admin.
- Riwayat menunjukkan aktivitas dan catatan review. Pemulihan otomatis dari versi draf lama belum tersedia; simpan salinan perubahan penting sebelum mulai ulang draf.
- Fitur SMTP/Judge0 mengikuti konfigurasi pada panduan umum. Penyusunan latihan kode tidak berarti penilaian resmi sudah aktif.
- Catat hasil CUR-01 sampai CUR-20 di lembar hasil berikut. Seluruh hasil awal **Belum diuji**; keberhasilan tes pengembang tidak menggantikan UAT tim.

| ID | Hasil | Bukti / temuan / penguji |
| --- | --- | --- |
| CUR-01 | Belum diuji | |
| CUR-02 | Belum diuji | |
| CUR-03 | Belum diuji | |
| CUR-04 | Belum diuji | |
| CUR-05 | Belum diuji | |
| CUR-06 | Belum diuji | |
| CUR-07 | Belum diuji | |
| CUR-08 | Belum diuji | |
| CUR-09 | Belum diuji | |
| CUR-10 | Belum diuji | |
| CUR-11 | Belum diuji | |
| CUR-12 | Belum diuji | |
| CUR-13 | Belum diuji | |
| CUR-14 | Belum diuji | |
| CUR-15 | Belum diuji | |
| CUR-16 | Belum diuji | |
| CUR-17 | Belum diuji | |
| CUR-18 | Belum diuji | |
| CUR-19 | Belum diuji | |
| CUR-20 | Belum diuji | |
