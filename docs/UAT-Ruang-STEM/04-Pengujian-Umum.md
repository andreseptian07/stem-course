# Pengujian umum — semua peran

**Web:** https://ruangstem.com. **Acuan:** 8 Oktober 2026, rilis Tim Kurikulum (catat SHA yang diuji).

Jalankan kasus pada akun Admin, Tutor dan Siswa secara terpisah; tulis peran pada [lembar hasil](06-Hasil-dan-Temuan.md). Nama menu menyesuaikan hak akun. Kasus perubahan password Admin memerlukan koordinasi pemilik karena semua sesi owner akan dicabut. Gunakan akun uji untuk percobaan negatif.

## 1. Login, profil dan foto

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| UM-01 | Wajib | Logout; coba satu kali password salah pada akun uji, lalu password benar. Gunakan tombol tampil/sembunyikan password. | Kredensial salah ditolak dengan pesan umum; yang benar masuk; tampilan password dapat dikendalikan dan tidak muncul dalam bukti. |
| UM-02 | Wajib | Buka URL terlindungi tanpa login; sesudah diarahkan, login. Refresh dan buka Dashboard melalui navigasi. | Tujuan kembali berada dalam aplikasi dan dapat diakses sesuai hak; sesi bertahan pada refresh; navigasi Dashboard/Keluar jelas. |
| UM-03 | Wajib | Profil: ubah nama, bio, institusi, minat, tujuan dan warna avatar; simpan lalu pindah/refresh. | Data tersimpan pada akun sendiri; email bukan input yang bebas diedit dari profil. Nama yang dipakai sertifikat mengikuti profil tersimpan. |
| UM-04 | Wajib | Coba nama kosong dan bio/tujuan melebihi batas yang ditampilkan; perbaiki; ubah isian belum disimpan lalu coba meninggalkan form. | Validasi jelas; data tersimpan lama tidak rusak; perubahan belum disimpan mendapat perlindungan/peringatan sesuai form. |
| UM-05 | Wajib | Profil sama dibuka dua tab; simpan bio pertama, lalu simpan isian lama tab kedua. | Konflik versi tidak menimpa bio terbaru diam-diam; setelah reload form memperlihatkan data baru. |
| UM-06 | Wajib | Pilih foto PNG/JPEG valid ≤2 MiB; ubah lagi; refresh; hapus foto **uji**. Saat mengganti foto, biarkan satu isian bio belum disimpan. | Foto langsung tersimpan tanpa tombol simpan biodata; bio yang sedang diketik tidak hilang. Setelah hapus kembali ke avatar inisial. |
| UM-07 | Wajib | Coba foto >2 MiB, PDF/SVG dan gambar rusak; lalu ganti/hapus foto dari tab yang sudah usang setelah tab lain menggantinya. | Jenis/ukuran rusak ditolak; foto terbaru tidak tertimpa oleh tab lama. |
| UM-08 | Wajib | Salin URL foto **uji sendiri**; buka dari akun uji lain dan profil tanpa login. | Foto privat ditolak untuk pengguna lain/pengunjung; tidak dianggap avatar publik pada kelas/diskusi. |

## 2. Notifikasi

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| UM-09 | Wajib | Koordinator memicu pendaftaran/persetujuan, undangan akun yang sudah ada, penugasan kelas, tugas terbit, pengumuman, kiriman baru dan hasil review. Buka notifikasi pada tiap penerima. | Admin/Tutor/Siswa mendapat kejadian yang sesuai hak dan perannya. Undangan orang yang belum punya akun tetap dibagikan manual. Tidak mengharapkan email/push untuk semua kejadian. |
| UM-10 | Wajib | Pilih Belum dibaca; tandai satu; gunakan Buka pada lainnya; tandai semua; refresh/logout-login. Koordinator kemudian memicu review baru. | Status baca dan lencana konsisten; Buka menuju objek tepat dan menandai baca; notifikasi baru tidak ikut ditandai oleh tindakan lama. Review berubah dapat muncul sebagai kejadian baru. |
| UM-11 | Wajib untuk pengingat mendatang; batas waktu bersyarat | Buat sesi sekitar 2 jam mendatang; anggota kelas/RSVP sah memeriksa pengingat. Untuk sesi >24 jam, belum ada pengingat; pada putaran yang melewati waktu mulai cek lagi. | Pengingat muncul mulai 24 jam sebelum sesi dan hilang ketika sesi mulai. Agenda tetap sesuai hak dan WIB. Akun tanpa RSVP tidak mendapat pengingat privat sesi course. |
| UM-12 | Wajib | Pada kelas uji, Admin mencabut anggota/penugasan atau mengarsipkan. Refresh notifikasi akun terdampak; bandingkan pengguna lain. | Hak diperiksa ulang; notifikasi kelas yang tidak lagi tersedia tidak membuka data privat. Feed bukan arsip semua kejadian sepanjang waktu. Isi tugas, feedback, jawaban, token dan URL meeting tidak disalin ke feed. |

Daftar/lencana mengambil data sekitar setiap 45 detik saat tab terlihat dan ketika kembali ke tab; gunakan Muat ulang jika perlu. Maksimal 100 kejadian terbaru. Jangan membuat 100 kejadian di web produksi hanya untuk menguji batas daftar.

## 3. Logout, password, perangkat dan ketahanan tampilan

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| UM-13 | Wajib | Buka `/logout` lalu kembali tanpa konfirmasi; kemudian buka lagi dan tekan Keluar; gunakan Back lalu refresh halaman terlindungi. | Halaman konfirmasi saja tidak logout; konfirmasi mengakhiri sesi. Permintaan baru tidak membuka halaman/data privat; progres tidak hilang. Konten lama yang sudah tampil tidak otomatis terhapus dari riwayat layar. |
| UM-14 | Wajib pada Siswa/Tutor; Admin terkoordinasi | Login akun uji pada dua profil browser. Ganti password memakai password saat ini dan frasa baru valid. Profil kedua meminta data baru; coba login lama lalu baru. | Semua sesi lama dicabut; password lama gagal dan baru berhasil. Data/progres/hak tetap ada. Jangan membagikan password baru dalam laporan. |
| UM-15 | Wajib | Pada ponsel lebar sekitar 360–430 px, jalankan login, Dashboard, Profil, materi/kuis, kelas/tugas dan notifikasi; Tutor review; Admin editor/laporan. | Menu terbuka/tertutup, tombol tidak tertutup, input/hasil terbaca; tabel dapat digeser di wadahnya; tidak ada bagian penting hilang atau halaman melebar tanpa kendali. Catat perangkat aktual. |
| UM-16 | Wajib | Gunakan Tab/Shift+Tab/Enter dan Escape yang didukung; buka dialog, pilih akun, isi form lalu batalkan/simpan. Zoom browser 200%. | Fokus terlihat, urutan masuk akal, label/pesan terkait; tindakan penting dapat dioperasikan keyboard. Dialog tidak memerangkap pengguna; zoom tidak menyembunyikan tombol/teks utama. |
| UM-17 | Wajib | Periksa kondisi kosong sebelum data dibuat; pindah dari Dashboard ke objek uji, refresh, Back/Forward. Putus koneksi perangkat sebentar saat membuka halaman/menyimpan data uji, pulihkan dan periksa ulang hasil sebelum mengulang. | Kondisi kosong menjelaskan langkah lanjut; pilihan URL bertahan; error dan cara mencoba ulang jelas. Tidak menampilkan sukses palsu. Permintaan mungkin sudah tersimpan meski respons terputus: cek daftar/riwayat sebelum klik ulang; tidak menghasilkan duplikasi alur. |
| UM-18 | Wajib | Ganti password dengan password saat ini salah, frasa baru terlalu pendek atau konfirmasi berbeda; batalkan lalu login kembali dengan password lama. | Input tidak sah ditolak; password lama tetap berlaku; tidak mengakhiri sesi hanya karena membuka form. |
| UM-19 | Bersyarat: waktu | Pada akun uji tutup semua tab/aplikasi yang memakai sesi tersebut, hentikan polling, biarkan idle >1 jam; kembali dengan permintaan baru. Putaran terpisah periksa batas absolut >8 jam. | Diminta login saat idle/masa sesi habis. Tab aktif yang polling dapat memperpanjang aktivitas, sehingga bukan uji idle yang sah. Tidak mengubah jam server/database. |

## 4. Email dan pemulihan akun

Saat SMTP belum aktif, tim menjalankan UM-20/UM-21 dan mencatat UM-22–UM-27 Terblokir. Operator menyediakan pemulihan manual setelah memastikan identitas pemohon; tidak ada tombol reset password pengguna pada panel Admin. Penguji tidak memerlukan kredensial database atau terminal hosting.

| ID | Cakupan | Prasyarat dan langkah | Hasil yang diharapkan |
| --- | --- | --- | --- |
| UM-20 | Wajib | Tanpa SMTP, buka Lupa password dan Verifikasi email; isi email uji terdaftar dan satu email tim yang tidak terdaftar, masing-masing satu kali. | Form/pesan dapat dipahami, respons tidak membocorkan apakah akun ada; tidak mengharapkan email terkirim ketika layanan belum aktif. Catat bantuan operator yang tersedia bila peserta membutuhkan pemulihan. |
| UM-21 | Wajib | Buka `/reset-password` tanpa tautan; buka tautan uji tidak valid ke halaman reset/verifikasi. | Tidak dapat mengganti password/memverifikasi tanpa token valid; ada petunjuk meminta tautan baru; tidak membocorkan token di pesan. |
| UM-22 | Bersyarat: SMTP aktif | Minta verifikasi pada Siswa/Tutor uji; cek inbox/spam/pengirim/domain; buka tautan lalu tekan Verifikasi email saya; refresh status akses. | Kepemilikan email ditandai setelah konfirmasi; hanya membuka tautan tidak langsung menyetujuinya. Akun pending tetap pending meski email terverifikasi. Tautan memakai ruangstem.com. |
| UM-23 | Bersyarat: SMTP aktif | Minta reset password akun uji; buka email dan tetapkan frasa valid. Periksa sesi lain, login password lama/baru dan pemberitahuan perubahan. | Reset berhasil, semua sesi lama dicabut, password lama gagal; notifikasi email perubahan tidak berisi password. Reset tidak memberikan persetujuan akun/hak Tutor/verifikasi email otomatis. |
| UM-24 | Bersyarat: SMTP aktif dan waktu | Reopen tautan yang sudah dipakai. Simpan tautan reset lain >30 menit, verifikasi >24 jam tanpa dipakai, lalu coba. | Tautan sekali pakai/kedaluwarsa ditolak; meminta tautan baru tetap tersedia. Jangan mengubah database untuk mempercepat waktu. |
| UM-25 | Bersyarat: SMTP aktif | Pada akun uji, minta tautan reset lalu ganti password lewat form normal sebelum tautan dipakai; coba tautan lama. | Tautan yang terikat password lama tidak dapat dipakai setelah password berubah; hak/data akun tetap benar. |
| UM-26 | Bersyarat: SMTP aktif, jendela uji koordinator | Minta verifikasi/reset bertahap untuk alamat uji sama melewati batas 3 permintaan/jam hanya jika koordinator menyetujui jadwal dan layanan tidak dipakai tim lain. | Pembatasan ditampilkan jelas tanpa mengirim email tak terbatas; pengguna dapat menunggu/menghubungi pengelola. Jangan mencoba menembus batas atau menghabiskan anggaran global. |
| UM-27 | Bersyarat: SMTP aktif dan kewajiban verifikasi | Admin mewajibkan verifikasi. Akun aktif belum terverifikasi yang masih login mencoba belajar/upload/review; verifikasi lalu coba lagi. | Sesi lama ikut dibatasi sampai terverifikasi. Akun Siswa pending tetap perlu persetujuan; Admin tetap dapat mengelola jika pengiriman bermasalah. |

## Bukti dan hasil

Simpan screenshot tanpa rahasia, waktu WIB, browser/perangkat, alias dan keadaan akun, serta hasil aktual. Untuk UM-01–UM-18 yang diuji pada tiga peran, catat peran secara terpisah pada lembar hasil. Hasil Siswa tidak menjadi bukti otomatis bahwa form Admin atau Tutor bekerja.
