# Panduan pengujian manual — Tutor Ruang STEM

**Peran:** Tutor A dan Tutor B. **Web:** https://ruangstem.com. **Acuan:** 8 Oktober 2026, rilis Tim Kurikulum (catat SHA yang diuji).

Baca [persiapan](00-Mulai-Di-Sini.md), ikuti [urutan lintas akun](05-Siklus-Lintas-Akun.md), dan isi [hasil](06-Hasil-dan-Temuan.md). Tutor A menangani Kelas A, Tutor B menangani Kelas B. Keduanya tidak menjadi anggota kelas Tutor lain. Jalankan pula `UM-01`–`UM-17` pada [pengujian umum](04-Pengujian-Umum.md).

Tutor mengelola pendampingan kelas yang ditugaskan. Hak Tutor sendiri tidak memberi akses editor course global. Jika Admin juga menugaskannya ke Tim Kurikulum, Tutor dapat menyusun draf pada course tersebut melalui workspace kurikulum, lalu mengajukannya untuk review Admin. Jalankan [07 — Tim Kurikulum](07-Tim-Kurikulum.md) untuk penugasan tambahan ini.

## 1. Aktivasi dan batas hak

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| TUT-01 | Wajib | Tutor A membuka tautan undangan privat Admin, memasukkan email penerima, password baru valid dan konfirmasi, lalu mengaktifkan. | Akun aktif dengan hak Tutor terbentuk; login berhasil; tidak perlu pendaftaran Siswa terpisah. Jangan menaruh token pada bukti. |
| TUT-02 | Wajib | Tutor B sudah punya akun Siswa pending. Buka undangan, login sebagai penerima jika diminta, kemudian aktifkan. | Akun yang sama aktif sebagai Tutor; password dan progres lama dipertahankan; tidak dibuat akun kedua. |
| TUT-03 | Wajib | Pada undangan uji cadangan, coba email penerima yang berbeda atau login dengan akun uji lain. | Aktivasi ditolak; hak Tutor dan penugasan tidak diberikan kepada akun yang salah. |
| TUT-04 | Wajib | Buka kembali tautan yang sudah digunakan; coba undangan yang dibatalkan/diganti oleh Admin. | Tautan sekali pakai dan tidak valid ditolak; tidak menggandakan hak/penugasan. |
| TUT-05 | Bersyarat: waktu | Simpan undangan uji yang tidak dipakai selama lebih dari 7 hari; buka kembali. | Undangan kedaluwarsa ditolak. Jangan mengubah jam/database produksi untuk mempercepat kasus. |
| TUT-06 | Wajib | Sebelum penugasan, buka Dashboard dan Kelas; sesudah Admin menugaskan Tutor A ke Kelas A, refresh. | Kondisi tanpa kelas jelas; sesudah penugasan kelas yang benar tampil. Tidak otomatis mendapat semua kelas. |
| TUT-07 | Wajib | Buka langsung `/learn?view=admin`, `/access`, dan URL ekspor laporan yang disalin Admin dari data uji. | Tidak dapat memakai editor course Admin, menyetujui pengguna, mengundang Tutor, atau membaca laporan global. Penyusunan draf hanya melalui workspace untuk course yang ditugaskan. `/access` boleh menunjukkan status akun sendiri. |

## 2. Dashboard dan pemantauan siswa

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| TUT-08 | Wajib | Buka mode pendampingan pada Dashboard; cocokkan kelas, antrean dan jadwal sebelum/sesudah Siswa mengirim tugas. | Ringkasan hanya kelas yang ditangani; kiriman terbaru menunggu review muncul; jadwal Kelas A benar dan waktu WIB. |
| TUT-09 | Wajib | Klik kiriman dari antrean dan kelas dari ringkasan; refresh halaman tujuan; gunakan Dashboard/Kembali. | Masuk ke kelas/tugas yang tepat tanpa kehilangan pilihan akibat refresh; navigasi kembali tersedia. |
| TUT-10 | Wajib | Pada Kelas A, buka Peserta & progres; cocokkan materi/kuis A dan B. B telah habis kuota M1; pilih Buka kuota. | Progres dan hitungan percobaan sesuai. Reset kuota B tidak meluluskan materi dan tidak memengaruhi A. Tutor tidak dapat menyetujui/menolak/mengakhiri keanggotaan. |
| TUT-11 | Wajib | Setelah revisi M1 oleh Admin, lihat kembali progres B dan ringkasan kelas. | Materi yang berubah terlihat perlu ditinjau; hasil lama tidak dianggap penyelesaian terbaru. |

## 3. Tugas, lampiran dan review

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| TUT-12 | Wajib | Buat A1/A2/AD sesuai bahan uji, atau edit tugas yang disiapkan Admin; simpan, pindah dan buka ulang. | Judul, instruksi, tenggat dan status tersimpan. Draft terlihat kepada staf; Siswa hanya melihat tugas terbit/ditutup. |
| TUT-13 | Wajib | Coba tugas tanpa judul/instruksi; isi valid dan simpan. Setelah ada kiriman pada A1, coba mengembalikannya ke draft. | Isian wajib ditolak; tugas valid tersimpan; tugas yang sudah mempunyai kiriman tidak dapat disembunyikan kembali sebagai draft. |
| TUT-14 | Wajib | A mengunggah lampiran A1 tetapi belum mengirim. A membagikan URL **uji** lampiran tersebut ke koordinator; Tutor mencoba membuka. Sesudah A mengirim, coba lagi. | Lampiran belum dikirim tidak dapat dibaca Tutor. Setelah terikat pada kiriman, Tutor yang ditugaskan dapat mengunduh. |
| TUT-15 | Wajib | A mengirim A1 dengan TXT/PDF/gambar. Buka kiriman, unduh dan periksa berkas; cocokkan penjelasan, tautan dan penanda waktu. | Isi sesuai berkas A; tidak tertukar dengan B; dokumen unduh tidak ditampilkan sebagai HTML aktif. |
| TUT-16 | Wajib | Review percobaan pertama A1: pilih Perlu revisi, isi feedback spesifik dan nilai bila diperlukan; simpan. Coba feedback kosong/nilai di luar 0–100 pada kiriman uji. | Review valid tersimpan dan terlihat pada A; nilai tidak sah/feedback kosong ditolak. Antrean kiriman ini berkurang; A bisa mengirim revisi ketika tugas terbuka. |
| TUT-17 | Wajib | A mengirim revisi dengan lampiran baru. Periksa percobaan 1 dan 2; terima percobaan terakhir dengan feedback. | Riwayat lama dan berkas lama tetap ada; kiriman terakhir Diterima; hanya kiriman terbaru yang dapat direview sebagai keadaan saat ini. Nilai tugas tidak menggantikan kelulusan kuis/kode course. |
| TUT-18 | Wajib | A1 sudah diterima, A2 belum diterima. A mencoba sertifikat; kemudian review dan terima A2; A muat ulang syarat. | A belum layak sampai seluruh tugas terbit/ditutup kelas terpilih diterima. AD draft tidak dihitung. Tutor tidak menerbitkan sertifikat atas nama A. |
| TUT-19 | Wajib | Buka kiriman B pada dua tab Tutor; simpan review tab pertama, lalu review dari tab lama. | Konflik versi ditolak/diminta muat ulang; review pertama tidak diam-diam tertimpa. |
| TUT-20 | Wajib | A1 memiliki kiriman menunggu review; tutup pengumpulan; lakukan review lalu A mencoba mengirim baru. Buka kembali tugas jika perlu revisi. | Tutor tetap dapat mereview tugas ditutup; pengiriman baru ditolak saat ditutup. Setelah dibuka kembali dan status Perlu revisi, Siswa bisa mengirim ulang. |
| TUT-21 | Wajib | Pada tugas kecil terpisah, setel tenggat yang baru lewat; Siswa mengirim ketika status masih terbuka; periksa penanda. | Kiriman tetap diterima dan ditandai terlambat; tenggat bukan penutupan otomatis. Tutup tugas secara eksplisit jika ingin menghentikan kiriman. |
| TUT-22 | Wajib, fase revisi | B belum bersertifikat dan A1 B sudah diterima. Ubah instruksi A1; B cek syarat. Minta revisi kiriman B, buka pengumpulan, B kirim ulang, lalu terima lagi. | Penerimaan terhadap instruksi lama tidak memenuhi syarat terbaru. Riwayat instruksi lama tetap ada; revisi terbaru diterima sesuai instruksi baru. Mengubah judul/tenggat/menutup tanpa mengubah instruksi tidak membatalkan penerimaan. |

## 4. Diskusi, feedback dan jadwal

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| TUT-23 | Wajib | Di Kelas A kirim diskusi dan pengumuman; A/B membaca dan membalas diskusi. | Tulisan berada di kelas yang benar, nama/waktu sesuai; pengumuman staf muncul untuk anggota yang berhak. |
| TUT-24 | Wajib | Kirim Feedback pribadi khusus A; A membaca, B mencoba melihat. | Hanya A, Tutor kelas saat ini dan Admin dapat membacanya; B tidak mendapat isi feedback A. Feedback pribadi berbeda dari diskusi dan review tugas. |
| TUT-25 | Wajib | Buat Sesi KA online mendatang 30 menit dan sesi tatap muka dengan lokasi; edit jadwal; A/B cek agenda. Coba URL HTTP, waktu lampau, lokasi tatap muka kosong. | Validasi jelas; sesi valid tersimpan dan muncul sesuai WIB. Tautan meeting hanya untuk akun berhak. Sesi kelas tidak memakai kapasitas/RSVP sesi course. |
| TUT-26 | Wajib | Tutor A membuka URL Kelas B, kiriman/lampiran B1, feedback dan tautan sesi B yang disalin akun berhak; ulangi Tutor B terhadap Kelas A. | Informasi privat dan pengelolaan kelas lain ditolak. Ringkasan kelas yang memang publik boleh muncul. |

## 5. Perubahan hak dan arsip

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| TUT-27 | Wajib, fase akhir | Biarkan form review/jadwal A terbuka; Admin melepas penugasan Tutor A; coba menyimpan lalu refresh Dashboard. | Hak lama tidak bisa dipakai untuk menyimpan/unduh; kelas/antrean tidak lagi ditampilkan sebagai penugasan. Riwayat lama tetap ada. |
| TUT-28 | Wajib, fase akhir | Admin mencabut hak Tutor A. Masih pada sesi lama, coba membuka pengelolaan kelas. Sesudah itu Admin dapat mengundang ulang pada putaran lain. | Kemampuan mengajar hilang pada permintaan baru; akun tetap Siswa sesuai status akses. Tidak ada hak Admin tambahan. |
| TUT-29 | Wajib, fase akhir | Admin menangguhkan lalu memulihkan Tutor B; Tutor masih login mencoba review ketika ditangguhkan. | Review/akses belajar ditolak saat suspended; pemulihan tidak menghapus riwayat. Status akun dan penugasan diperiksa ulang. |
| TUT-30 | Wajib, fase akhir | Dengan penugasan sah, buka kelas yang diarsipkan; coba posting, review, tugas baru atau edit jadwal. | Riwayat masih dapat dibaca sesuai hak; operasi tulis kelas arsip ditolak. |

## Serah-terima Tutor

Laporkan ID kiriman uji/percobaan terakhir, status review, feedback yang seharusnya diterima Siswa, jadwal WIB, dan kasus yang terblokir. Kirim bukti yang sudah disamarkan kepada koordinator, lalu minta penguji Siswa mengonfirmasi hasil di akunnya sendiri.
