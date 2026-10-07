# Laporan pengelola Ruang STEM

Tersedia lokal melalui Kelola course → tab **Laporan**, hanya untuk Super Admin dengan akun aktif. Endpoint JSON/CSV juga memeriksa hak akses. Tidak memerlukan tabel atau migrasi baru; laporan membaca data Hostinger yang sudah tersedia. Aplikasi belum di-deploy.

## Menggunakan laporan

Pilih seluruh course atau satu course, lalu periode aktivitas 7, 30 atau 90 hari terakhir. Course contoh dikecualikan secara default; centang opsi untuk menyertakannya. Course draft tetap terlihat bagi pengelola. Muat ulang mengambil data terbaru. Periode merupakan rentang bergulir hingga waktu permintaan, bukan periode kalender; waktu ditampilkan dalam WIB.

Ringkasan menyediakan peserta unik, pasangan peserta–course, penyelesaian materi/tes wajib, peserta aktif dalam periode, antrean review dan jumlah sertifikat valid. Siswa yang mengikuti dua course dihitung sekali pada peserta unik dan dua kali pada pasangan peserta–course. Penyelesaian juga dihitung per pasangan.

## Definisi dan batas data

- Peserta berasal dari pendaftaran course, progres yang tersimpan atau keanggotaan kelas yang disetujui. Akun pengelola dikecualikan; Tutor yang belajar juga dapat masuk sebagai peserta. Akun pending/ditangguhkan tetap tampil dengan statusnya. Posting saja tanpa pendaftaran, progres atau keanggotaan tidak menambahkan seseorang ke daftar peserta.
- Materi selesai hanya jika progres cocok dengan revisi terbaru, tanda selesai tersedia, dan kuis/kode wajib lulus. Progres pada materi yang dihapus tidak menambah penyelesaian. Course tanpa materi tidak dianggap selesai. Revisi lama ditampilkan terpisah.
- Belum mulai berarti belum ada progres atau aktivitas yang tercatat pada pasangan itu. Aktivitas periode mencakup percobaan kuis/kode, posting diskusi course/kelas dan pengumpulan tugas. Percobaan gagal atau belum selesai tetap merupakan aktivitas. Review yang diterima tidak dihitung sebagai aktivitas Siswa.
- Aktivitas terakhir mengambil catatan terbaru yang tersedia, termasuk sebelum periode terpilih. Tanggal masa depan dikecualikan. Sistem belum menyimpan riwayat kunjungan halaman, waktu belajar, tanggal penyelesaian materi atau histori login lengkap; laporan tidak menyimpulkannya dari data lain.
- Selesai materi dan tes wajib belum sama dengan syarat sertifikat: tugas kelas juga perlu diterima Tutor. Jumlah sertifikat valid menghitung dokumen yang belum dicabut, termasuk dokumen versi course sebelumnya.
- Beban review menggunakan kelas nonarsip dan penugasan Tutor saat ini, termasuk penugasan mentor lama. Antrean memakai kiriman terakhir berstatus menunggu review dari anggota disetujui. Tugas ditutup tetap dapat direview. Kelas tanpa Tutor tampil sebagai belum ditugaskan; Tutor tanpa kelas dapat tampil dengan angka nol.
- Keanggotaan menghitung per kelas. Kiriman direview dalam periode menghitung kiriman yang mempunyai tanggal review terbaru pada kelas yang kini ditangani; bukan jumlah seluruh tindakan atau kinerja pribadi Tutor. Data saat ini tidak mencatat ID reviewer/histori setiap tindakan review secara lengkap. Review di kelas arsip tidak masuk ringkasan beban kelas aktif.

Angka mencerminkan data saat laporan diminta. Aktivitas yang berubah selama pembacaan dapat memerlukan Muat ulang. Laporan ini tidak mengubah progres atau memberikan kelulusan.

## Ekspor CSV

Tiga ekspor tersedia: ringkasan course, peserta/aktivitas dan beban review Tutor. Masing-masing memakai filter course/periode yang sedang dipilih dan menghitung ulang data saat unduhan diminta. Pencarian nama/course/status hanya menyaring tabel peserta di browser; tidak memfilter ekspor.

CSV memakai UTF-8 dengan BOM, tanda kutip untuk setiap sel dan penggandaan tanda kutip di dalam nilai. Awalan yang dapat dibaca sebagai formula dinetralkan dengan tanda petik tunggal dan tab di dalam sel. Perlakuan ini mengikuti pertimbangan [OWASP tentang CSV injection](https://community.owasp.org/attacks/CSV_Injection); perilaku impor/simpan ulang berbeda antar spreadsheet. Nilai teks tersebut dapat memiliki awalan tambahan ketika diimpor ke sistem lain. Waktu di CSV berformat ISO UTC dan konteks filter disertakan pada setiap baris.

CSV peserta memuat nama dan ID akun untuk kebutuhan pengelola. Email, profil pribadi, isi pekerjaan, tautan/lampiran, jawaban kuis, feedback dan alasan pencabutan sertifikat tidak disertakan. Tidak ada ekspor publik.

## Kapasitas dan pemeriksaan

Tabel peserta menampilkan maksimal 200 hasil pencarian; ekspor mencakup seluruh hasil laporan. Permintaan dibatasi maksimal 500 course, 5.000 pasangan peserta–course dan 500.000 baris progres. Jika melewati batas, laporan ditolak dengan pesan memilih satu course; tidak menampilkan total dari data yang terpotong.

129 tes lokal dan TypeScript lulus. Enam skenario laporan lulus pada MariaDB Hostinger dengan data sintetis dalam satu transaksi rollback; jumlah baris terkait tetap. Modul baru lulus lint; lint repository masih memiliki temuan lama. Tampilan data contoh diperiksa pada desktop/mobile, termasuk pencarian dan filter course. UAT akun sungguhan serta suite MariaDB/HTTP CI penuh belum dilakukan pada tahap ini.

## UAT

1. Login Super Admin, buka tab Laporan. Cocokkan satu course uji dengan progres Siswa dan daftar anggota kelas.
2. Pilih course/periode, sertakan course contoh, lalu muat ulang. Pastikan tautan ekspor membawa filter yang sama.
3. Siswa menyelesaikan materi dan tes wajib; muat ulang laporan. Ubah revisi materi uji: penyelesaian lama tidak ikut dihitung sebagai versi terbaru.
4. Siswa mengirim tugas, Tutor meminta revisi, Siswa mengirim ulang dan Tutor menerima. Antrean menghitung kiriman terbaru; kelas arsip dan anggota yang belum disetujui tidak menjadi antrean review.
5. Bandingkan antrean dengan dashboard Tutor. Periksa kelas belum ditugaskan serta status akses Tutor yang ditangguhkan.
6. Unduh tiga CSV. Periksa nama Unicode, kolom, hitungan dan periode pada spreadsheet yang akan dipakai pengelola. Jangan memasukkan data pengguna nyata ke laporan contoh yang akan dibagikan.
7. Coba endpoint laporan/ekspor menggunakan akun Siswa, Tutor dan tanpa login: akses harus ditolak. Periksa pencarian, keyboard serta geser tabel pada ponsel.
