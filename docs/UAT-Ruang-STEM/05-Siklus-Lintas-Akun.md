# Siklus pengujian lintas akun dan koordinasi tim

**Koordinator:** __________  **Putaran:** __________  **Rilis:** __________  **Tanggal WIB:** __________

Gunakan [data persiapan](00-Mulai-Di-Sini.md) dan [lembar hasil](06-Hasil-dan-Temuan.md). Nomor fase menunjukkan urutan; nomor kasus menunjuk langkah rinci pada dokumen peran. Beberapa kasus dilakukan pada beberapa fase karena keadaannya berubah.

## Pembagian tugas dan catatan objek

| Tugas | Penanggung jawab |
| --- | --- |
| Admin dan persetujuan perubahan fase | __________ |
| Penyusun Q1 / Q2 | __________ / __________ |
| Tutor A / Tutor B | __________ / __________ |
| Siswa A / Siswa B / Siswa C | __________ / __________ / __________ |
| Pengunjung, uji mobile/keyboard | __________ |
| SMTP, Judge0, backup dan pemeriksaan hosting | Operator yang ditunjuk: __________ |
| Rekap bug, pengujian ulang dan keputusan pilot | __________ |

| Objek uji | URL/ID aman (tanpa token) | Status terakhir |
| --- | --- | --- |
| C1 / M1 / M2 / M3 / M4 | | |
| C2 draft | | |
| C3 kode wajib | | |
| Kelas A / B / Kosong | | |
| Tugas A1 / A2 / AD / B1 | | |
| Sesi KA / KB / C1 | | |
| Sertifikat uji A yang boleh dicabut | | |
| Sertifikat uji B yang dipertahankan valid | | |

Simpan token aktivasi/email pada saluran privat terpisah, bukan tabel ini. Jangan mulai fase berikutnya sampai koordinator mengonfirmasi prasyaratnya. Jika kasus mengubah data untuk skenario negatif, kembalikan kondisi sebelum alur utama diteruskan.

## Fase 1 — Persiapan dan akun

1. Catat rilis, kebijakan pendaftaran, status SMTP/Judge0 dan bukti backup awal (OP-01). Bagi profil browser; siapkan akun/email dan berkas sintetis.
2. Admin menjalankan ADM-01–ADM-06. Pengunjung/Siswa menjalankan SIS-01–SIS-06 serta UM-01–UM-02. Jika C1 belum dibuat, kasus detail course/pendaftaran dari course diulang pada fase 2.
3. Admin undang Tutor A dan calon Tutor B (ADM-07–ADM-09). Tutor menjalankan TUT-01–TUT-07; expired TUT-05 dijadwalkan terpisah. Tutor B memakai akun yang sudah ada.
4. Pertahankan C pending untuk bukti pembatasan, kemudian setujui sebelum uji kapasitas. Jangan memasukkan C ke Kelas A yang akan diisi A/B.
5. Serah-terima: Siswa A/B aktif, Tutor A/B aktif, akun C pernah diuji pending. Password tetap privat.

## Fase 2 — Konten, penugasan dan keanggotaan

1. Admin membuat C1/C2, empat materi, kuis/media, sertifikat aktif: ADM-12–ADM-21, ADM-35. Uji konflik editor di **C2**, lalu pulihkan data.
2. Pengunjung memeriksa katalog/draft; A/B mendaftar C1 (SIS-01, SIS-03, SIS-07). Catat URL dokumen M2 sebelum prasyarat terbuka untuk uji kunci.
3. Admin membuat kelas (ADM-24), menetapkan A/B ke kelas masing-masing, lalu A/B meminta bergabung (SIS-17). Pastikan pending belum bisa membaca isi; setujui A/B di Kelas A dan B di Kelas B (ADM-25, SIS-18).
4. Jalankan kapasitas/penolakan C (ADM-26, SIS-19), kemudian tambahkan C hanya ke Kelas Kosong. Kelas B menjadi Kelas berjalan.
5. Tutor/Admin siapkan A1/A2/AD/B1 dan sesi KA/KB; uji TUT-12–TUT-13, TUT-25. Admin siapkan sesi course kapasitas 1 (ADM-29).
6. Serah-terima: C1 terbit, M1 wajib, M3 opsional, A1/A2 terbuka, AD draft, A/B anggota A, hanya B anggota B, C anggota Kelas Kosong. Catat baseline laporan C1 (ADM-39).

## Fase 3 — Belajar dan pendampingan

1. A gagal M1 sekali, lalu lulus; B gagal tiga kali dan kehabisan kuota (SIS-08–SIS-11). Coba dokumen M2 terkunci sebelum lulus.
2. Tutor A membuka kuota B (TUT-10). B kembali gagal satu kali lalu **Admin** membuka kuota B (ADM-27), sehingga dua jalur reset diuji tanpa kelulusan otomatis. B kemudian lulus.
3. A/B menyelesaikan materi M2–M4; uji media/Review/browser JS, progres refresh/logout, diskusi (SIS-12–SIS-15). Kuis/kode wajib tidak digantikan review tugas.
4. Uji diskusi, pengumuman dan feedback pribadi (TUT-23–TUT-24, SIS-20). Uji sesi kelas dan RSVP sesi course kapasitas 1 (ADM-30, SIS-21–SIS-22).
5. Jalankan notifikasi UM-09–UM-11; bandingkan Dashboard/progres Admin, Tutor dan Siswa (ADM-28, TUT-08–TUT-11).
6. Serah-terima: A selesai empat materi; B dapat selesai sesudah reset kuota. Belum ada tugas diterima/sertifikat, sehingga syarat sertifikat harus belum terpenuhi (SIS-32).

## Fase 4 — Tugas → review → revisi → diterima

1. A mengunggah draft A1; Tutor belum dapat mengunduh (SIS-23–SIS-25, TUT-14). Uji batas berkas bertahap; jangan menghabiskan anggaran upload bersama.
2. A kirim A1; Tutor unduh bukti, lalu minta revisi (SIS-26–SIS-27, TUT-15–TUT-16). Coba kirim ulang saat menunggu: ditolak. Catat perubahan antrean/notifikasi (ADM-41, UM-09–UM-10).
3. Saat A masih **Perlu revisi**, buka form pada tab lama. Tutor mengubah instruksi A1; coba kirim dari tab lama (SIS-31). A muat ulang dan mengirim revisi sesuai instruksi baru; Tutor menerima (TUT-17). Riwayat percobaan dan berkas sebelumnya dipertahankan.
4. A1 diterima tetapi A2 belum: sertifikat tetap terhalang (TUT-18, SIS-28). A kirim A2 lalu Tutor terima.
5. B juga mengirim A1/A2; gunakan salah satu untuk konflik review dua tab TUT-19. Setelahnya terima keduanya. **B belum menerbitkan sertifikat** karena dipakai untuk fase revisi.
6. Buat tugas tambahan kecil untuk TUT-20–TUT-21/SIS-29, terima kiriman sebelum fase sertifikat jika tugas itu tetap terbit/ditutup di Kelas A. Alternatif jalankan tugas tambahan di kelas uji terpisah supaya syarat sertifikat utama tidak berubah.
7. Serah-terima: semua tugas non-draft Kelas A diterima untuk A, B1 tetap belum diterima; C tetap pada kelas tanpa tugas. Antrean dan riwayat sesuai kiriman terakhir.

## Fase 5 — Sertifikat, privasi dan laporan

1. Jalankan SIS-32–SIS-34, ADM-36: A menyetujui nama, terbitkan, unduh PDF, klik verifikasi dan ulangi permintaan. Simpan nomor A yang ditetapkan boleh dicabut pada akhir.
2. B membandingkan Kelas A dan B; C mencoba Kelas Kosong (SIS-36). Jangan memberikan tugas kelas A sebagai bukti kelulusan kelas B.
3. Uji akses silang tugas/lampiran/feedback/foto dan area Admin (SIS-30, SIS-41, TUT-07, TUT-26, UM-08). Uji kunjungan publik verifikasi tanpa membagikan link PDF privat secara umum.
4. Cocokkan laporan/antrean/penyelesaian serta ekspor (ADM-39–ADM-44). Nama formula/emoji hanya pada identitas sintetis dan dipulihkan sebelum penerbitan.
5. Jalankan profil/foto/konflik/login/logout/ponsel/keyboard pada tiap peran (UM-01–UM-18), di luar momen serah-terima aktif. Password owner hanya pada jadwal yang disepakati pemilik.
6. Serah-terima: dokumen A valid, PDF dan verifikasi cocok, tidak ada data privat lintas akun; laporan direkonsiliasi dengan catatan baseline/perubahan tim.

## Fase 6 — Revisi dan kebijakan penerbitan

1. Admin matikan sertifikat sementara; A cek dokumen lama, B cek penerbitan; aktifkan kembali (ADM-37).
2. Admin revisi isi M1; B memeriksa progres, prasyarat dokumen dan syarat (ADM-22, SIS-16, TUT-11). A memeriksa dokumen lama yang tetap merekam versi penerbitan.
3. B menyelesaikan prasyarat/materi versi terbaru. Tutor ubah instruksi A1 B yang dulu diterima; lakukan Perlu revisi → kirim ulang → terima (TUT-22, SIS-37).
4. B mencoba nama emoji dan memulihkan nama valid (SIS-40), kemudian terbitkan sertifikat B Kelas A. Nama A yang sudah terbit boleh diubah untuk bukti snapshot dokumen (SIS-38).
5. Uji perubahan course terbit → draft → terbit (ADM-23) setelah bukti sertifikat/revisi tersimpan. Semua data uji utama tetap ada.

## Fase 6A — Siklus Tim Kurikulum

1. Siapkan Q1/Q2 aktif tanpa hak Tutor. Admin menugaskan Tutor A dan Q1 ke C1, Tutor B dan Q2 ke C2 (CUR-01–CUR-06). Hak mengajar dan hak penyusun diuji terpisah.
2. Jalankan draf bersama, upload privat, konflik simpan, peringatan perubahan belum disimpan, pengajuan dan notifikasi (CUR-07–CUR-13). Siswa A memeriksa bahwa materi terbit belum berubah.
3. Admin membaca semua materi, meminta perbaikan dengan catatan, lalu meninjau pengajuan ulang (CUR-14–CUR-16).
4. Uji batal dan konfirmasi persetujuan (CUR-17). Siswa memeriksa revisi dan mengulang materi berubah; materi yang sama mempertahankan progres. Sertifikat lama tetap merekam versi penerbitan.
5. Uji konflik dengan editor Admin di C2 agar tidak mengganggu alur utama, lalu draf baru, riwayat, mobile dan keyboard (CUR-18/CUR-20). Jangan menambahkan kode wajib ke C1 ketika Judge0 belum aktif.
6. Serah-terima: versi course berubah hanya setelah persetujuan; tidak ada hak Admin atau kelas yang diperoleh otomatis. Simpan bukti sebelum mencabut anggota pada fase 7 (CUR-19).

## Fase 7 — Perubahan hak, arsip dan pencabutan

1. Cabut keanggotaan kurikulum Q1 dan Tutor A (CUR-19), periksa sesi lama/notifikasi/upload, dan buktikan Tutor masih dapat menangani kelasnya sebelum hak Tutor dicabut. Tangguhkan/pulihkan B dan Tutor B saat sesi aktif (ADM-34, SIS-42, TUT-29). Setelah dipulihkan, periksa ulang Dashboard dan data lama.
2. Akhiri/pulihkan keanggotaan B Kelas A (ADM-31, SIS-43); Kelas B dan akun global tetap diuji terpisah.
3. Lepas/pindah penugasan Tutor A (ADM-32, TUT-27), uji sesi lama, kemudian kembalikan penugasan untuk pemeriksaan riwayat arsip.
4. Arsipkan Kelas A (ADM-33, TUT-30, SIS-44); hak membaca riwayat sesuai keanggotaan/penugasan, operasi tulis ditolak.
5. Cabut hak Tutor A (ADM-11, TUT-28). Cabut hanya sertifikat **uji A** (ADM-38, SIS-39); sertifikat B tetap valid agar perbandingan jelas.
6. Refresh notifikasi setelah perubahan hak/arsip (UM-12). Catat keadaan akhir untuk putaran berikutnya; jangan menghapus audit, progres atau riwayat review demi merapikan hasil.

## Fase 8 — Layanan bersyarat dan operasional

- Email: ADM-45 wajib sekarang. ADM-46–ADM-48 dan UM-22–UM-27 dijalankan setelah operator menyiapkan SMTP. UM-20–UM-21 tetap wajib. Jika kebijakan verifikasi diaktifkan, catat keadaan awal/akhir dan kesiapan seluruh akun tim.
- Judge0: penolakan layanan nonaktif pada ADM-49/SIS-35 wajib; penilaian resmi berhasil bersyarat. Gunakan C3 terpisah, dengan kode sederhana yang aman. Jangan menempatkan syarat kode wajib pada course pilot sebelum server benar-benar diuji.
- Jadwalkan pengujian waktu kedaluwarsa TUT-05, UM-11, UM-19, UM-24; tandai komponen waktu yang belum diuji.
- Operator menjalankan OP-01–OP-07 di bawah. Tim UAT tidak menerima kredensial hosting/database hanya untuk menjalankan pengujian aplikasi.

## Pemeriksaan operasional oleh pemilik/operator

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| OP-01 | Wajib sebelum pilot | Catat web/rilis, status deploy/SSL, akses operator pemulihan, konfigurasi backup database dan direktori upload; ambil/konfirmasi backup terbaru sebelum perubahan data UAT. | Versi yang diuji jelas; HTTPS normal; backup mencakup database **dan** bytes upload, bukan metadata saja. Bukti operasional disimpan privat tanpa kredensial. |
| OP-02 | Bersyarat: lingkungan pemulihan terpisah | Pulihkan salinan backup ke lingkungan uji terpisah; sesuaikan konfigurasi origin/storage melalui rencana operator. Login akun uji, periksa materi/progres/tugas/berkas/sertifikat. | Data dan berkas bisa dipulihkan secara konsisten; waktu pemulihan tercatat. Jangan menimpa database live. Perpindahan origin/storage tidak diasumsikan otomatis; dokumentasikan penanganan scope. |
| OP-03 | Bersyarat: restart/deploy terjadwal | Setelah menyimpan data dan upload uji, operator melakukan restart atau deploy yang memang dijadwalkan; tim login ulang bila diminta lalu unduh ulang berkas uji dan PDF. | Database/bytes upload/progres/riwayat bertahan; PDF dapat dibuat setelah deploy termasuk fontnya. Folder privat tidak tertimpa direktori build. |
| OP-04 | Wajib | Buka halaman/API baru sesuai hak; jika UI menampilkan error, operator lihat log pada waktu yang sama dan cocokkan temuan, dengan rahasia disamarkan. Tentukan saluran pelaporan error/bantuan tim. | Error dapat ditelusuri tanpa mencetak token/password/isi tugas privat; tidak ada error server yang diabaikan karena halaman tampak sukses. Jalur bantuan dan pemantau ditetapkan. |
| OP-05 | Wajib sebelum undangan pilot | Jalankan satu course calon peluncuran dari awal sebagai Siswa, lalu ulangi untuk seluruh minimal tiga course yang dipasarkan; verifikasi video/dokumen, jawaban, instruksi dan Tutor. | Konten asli siap, bukan hanya course UAT; syarat realistis dan bisa diselesaikan; tidak terkunci oleh Judge0 yang belum aktif. Ada tujuan/prasyarat dan kriteria penilaian jelas. |
| OP-06 | Bersyarat: lingkungan terpisah | Di lingkungan uji dengan data sintetis, periksa kuota upload 200 MiB akun, 100 berkas/200 MiB pengunggah-course, 100 notifikasi, 200 baris tampilan/ekspor penuh, batas kapasitas laporan, serta klik/permintaan bersamaan yang realistis. | Batas dijelaskan dan tidak menghasilkan data terpotong yang dianggap lengkap; duplikasi tidak mengubah hak/kursi/sertifikat. Jangan memenuhi batas dengan ribuan data di web live. |
| OP-07 | Wajib, penutupan putaran | Rekap kasus dan bug; arsipkan kelas UAT dan kembalikan course UAT ke draft; tetapkan status pendaftaran/email sesuai pilot; simpan bukti privat. | Katalog pemasaran tidak dipenuhi course uji; riwayat uji tetap dapat ditelusuri; data nyata tidak dihapus; keputusan pilot mencantumkan kasus terblokir dan pemilik tindak lanjut. |

## Matriks cakupan

| Siklus | Pemilik kasus utama | Fase |
| --- | --- | --- |
| Pendaftaran → pending → aktif | ADM-02–ADM-06, SIS-03–SIS-07 | 1–2 |
| Undangan → aktivasi Tutor → penugasan → pencabutan | ADM-07–ADM-11, ADM-32, TUT-01–TUT-07, TUT-27–TUT-29 | 1, 2, 7 |
| Penugasan penyusun → draf bersama → review → perbaikan → persetujuan → revisi siswa | CUR-01–CUR-20 | 6A, 7 |
| Draft → editor/media → terbit → revisi → draft | ADM-12–ADM-23, SIS-01, SIS-08–SIS-16 | 2, 3, 6 |
| Bergabung kelas → approved/declined → kapasitas → removed → arsip | ADM-24–ADM-26, ADM-31–ADM-34, SIS-17–SIS-19, SIS-42–SIS-44 | 2, 7 |
| Kuis gagal → batas → reset kuota → lulus → progres terbaru | ADM-27–ADM-28, TUT-10–TUT-11, SIS-09–SIS-16 | 3, 6 |
| Diskusi course/kelas → pengumuman → feedback pribadi | TUT-23–TUT-24, SIS-15, SIS-20 | 3 |
| Sesi kelas/course → RSVP → kapasitas → batal → pengingat | ADM-29–ADM-30, TUT-25, SIS-21–SIS-22, UM-11 | 3 |
| Draft tugas → terbit → upload → submit → revisi → accepted → tutup | TUT-12–TUT-22, SIS-23–SIS-31 | 2, 4, 6 |
| Kelayakan → persetujuan nama → sertifikat → PDF → verifikasi → revoke | ADM-35–ADM-38, SIS-32–SIS-40 | 5–7 |
| Aktivitas/progres/antrean → filter → laporan → CSV | ADM-39–ADM-44 | 2–6 |
| Identitas/profil/foto/sesi → logout/password/konflik/mobile | UM-01–UM-19 | Seluruh fase |
| Email manual/nonaktif → SMTP uji → aktivasi → verifikasi/reset | ADM-45–ADM-48, UM-20–UM-27 | 8 |
| Browser kode → layanan resmi nonaktif/aktif | ADM-49, SIS-13, SIS-35 | 3, 8 |
| Backup → pemulihan → restart → persistensi → kesiapan konten | OP-01–OP-07 | Awal, 8, penutupan |

## Kriteria selesai dan keputusan pilot

- Semua kasus wajib mempunyai hasil/bukti, termasuk pengujian umum pada tiap peran. Setiap kegagalan mempunyai temuan dan pengujian ulang setelah perbaikan.
- Alur Siswa A selesai dari daftar sampai PDF/verifikasi; alur revisi B selesai; notifikasi, laporan dan tampilan Tutor/Admin sesuai data yang sama.
- Tidak ada P0/P1 yang masih terbuka: kebocoran data, hak tanpa izin, kehilangan data, atau kegagalan alur utama.
- Kasus bersyarat yang Terblokir dicantumkan sebagai batas pilot, bukan dihitung Lulus. Pemilik menerima batas itu secara eksplisit pada lembar keputusan.
- Backup/pemulihan dan isi minimal tiga course diperiksa sebelum pemasaran. Jika pemulihan belum diuji, catat risiko operasional dan jadwalkan penyelesaiannya.
- P2/P3 dapat dijadwalkan bila tidak menghalangi pilot dan disetujui pemilik; setiap temuan mempunyai penanggung jawab.
