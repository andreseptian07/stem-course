import type { Course } from "./model";
export const sampleCourse: Course = {
  id: "esp32-starter",
  version: 1,
  graduationPolicyVersion: 2,
  learningMode: "independent_allowed",
  policyState: "ready",
  title: "Mulai membangun dengan ESP32",
  description:
    "Kenali sistem embedded, baca data sensor, dan susun proyek pertama Anda. Course contoh untuk mencoba platform.",
  category: "Embedded Systems",
  level: "Pemula",
  published: true,
  sample: true,
  lessons: [
    {
      id: "embedded",
      revision: 1,
      module: "01 · Fondasi perangkat",
      title: "Mengenal sistem embedded",
      minutes: 8,
      blocks: [
        {
          id: "intro",
          type: "callout",
          content:
            "Materi contoh untuk mencoba platform. Anda dapat mengganti seluruh isi melalui Kelola course.",
        },
        {
          id: "heading",
          type: "heading",
          content: "Dari ide menjadi perangkat nyata",
        },
        {
          id: "text",
          type: "text",
          content:
            "Sebuah sistem embedded menghubungkan program dengan dunia fisik. Sensor membaca kondisi lingkungan, mikrokontroler mengolah data, dan keluaran memberi informasi atau melakukan tindakan.\n\nDalam jalur belajar ini, ESP32 menjadi pusat pemrosesan. Kita mulai dari satu pembacaan, memahami maknanya, lalu menampilkannya agar dapat digunakan.",
        },
        { id: "diagram", type: "diagram", content: "Sensor|ESP32|Dashboard" },
        {
          id: "objective",
          type: "heading",
          content: "Perhatikan aliran informasinya",
        },
        {
          id: "objective-text",
          type: "text",
          content:
            "Kenali tiga peran utama: masukan, pemrosesan, dan keluaran. Sebelum merangkai alat, gambarkan hubungan ketiganya dengan kata-kata Anda sendiri.",
        },
      ],
      quiz: {
        mode: "review",
        threshold: 100,
        maxAttempts: 0,
        feedback: "always",
        questions: [
          {
            id: "q1",
            prompt: "Bagian mana yang membaca kondisi lingkungan?",
            options: ["Sensor", "Dashboard", "Kabel USB"],
            correct: [0],
            explanation:
              "Sensor mengubah kondisi fisik menjadi data yang dapat diproses.",
          },
        ],
      },
    },
    {
      id: "sensor",
      revision: 1,
      module: "01 · Fondasi perangkat",
      title: "Dari sensor menjadi data",
      minutes: 12,
      blocks: [
        {
          id: "s1",
          type: "heading",
          content: "Sebuah angka membutuhkan konteks",
        },
        {
          id: "s2",
          type: "text",
          content:
            "Ketika sensor menghasilkan angka 28, kita masih perlu mengetahui satuan, waktu pengukuran, dan kondisi pengambilan data. Data yang baik tidak hanya berupa angka, tetapi juga konteksnya.",
        },
        {
          id: "s3",
          type: "callout",
          content:
            "Tes pada materi ini menjadi syarat untuk membuka praktik. Jawab seluruh soal dengan benar, lalu lanjutkan.",
        },
        {
          id: "s4",
          type: "code",
          content: 'suhu = 28.0\nsatuan = "°C"\nprint(suhu, satuan)',
        },
      ],
      quiz: {
        mode: "required",
        threshold: 100,
        maxAttempts: 0,
        feedback: "always",
        questions: [
          {
            id: "q2",
            prompt:
              "Informasi apa yang membantu menafsirkan pembacaan sensor? Pilih dua.",
            options: [
              "Satuan pengukuran",
              "Waktu pengambilan data",
              "Warna kabel USB",
            ],
            correct: [0, 1],
            explanation:
              "Satuan menjelaskan besaran, sedangkan waktu memberi konteks kapan pengukuran dilakukan.",
          },
          {
            id: "q3",
            prompt:
              "Apa yang sebaiknya dilakukan pada pembacaan yang tidak masuk akal?",
            options: [
              "Selalu mengabaikannya",
              "Memeriksa koneksi, satuan, dan kondisi sensor",
              "Mengganti angka dengan nilai acak",
            ],
            correct: [1],
            explanation:
              "Lakukan pemeriksaan sumber data sebelum menyimpulkan.",
          },
        ],
      },
    },
    {
      id: "coding",
      revision: 1,
      module: "02 · Praktik dan eksplorasi",
      title: "Mengolah data sensor",
      minutes: 15,
      blocks: [
        { id: "c1", type: "heading", content: "Hitung rata-rata pembacaan" },
        {
          id: "c2",
          type: "text",
          content:
            "Program menerima bilangan yang dipisahkan spasi melalui standard input. Tampilkan rata-ratanya dengan tepat satu angka di belakang koma. Contoh: input 20 30 menghasilkan 25.0.",
        },
      ],
      exercise: {
        language: "python",
        prompt:
          "Baca seluruh angka dari input, hitung rata-rata, dan cetak dengan satu angka desimal.",
        starter:
          "values = list(map(float, input().split()))\n# Hitung dan tampilkan rata-rata di sini\n",
        required: true,
        maxAttempts: 0,
        tests: [
          { input: "20 30", expected: "25.0", hidden: false },
          { input: "1 2 3", expected: "2.0", hidden: false },
          { input: "-10 0 10 20", expected: "5.0", hidden: true },
        ],
      },
    },
    {
      id: "project",
      revision: 1,
      module: "02 · Praktik dan eksplorasi",
      title: "Merangkai proyek pertama",
      minutes: 20,
      blocks: [
        { id: "p1", type: "heading", content: "Hubungkan setiap bagian" },
        {
          id: "p2",
          type: "text",
          content:
            "Bagian ini disiapkan sebagai tempat instruksi praktikum Anda. Tambahkan diagram rangkaian, video demonstrasi, dan kode awal melalui editor materi.",
        },
        {
          id: "p3",
          type: "callout",
          content:
            "Gunakan diskusi materi untuk membahas kendala praktik dengan mentor. Anda juga dapat mengikuti sesi live ketika pengajar menjadwalkannya.",
        },
      ],
    },
    {
      id: "reflection",
      revision: 1,
      module: "03 · Refleksi",
      title: "Tinjau kembali proses belajar",
      minutes: 5,
      blocks: [
        { id: "r1", type: "heading", content: "Jelaskan apa yang Anda bangun" },
        {
          id: "r2",
          type: "text",
          content:
            "Apa yang diukur? Bagaimana data diproses? Bagaimana Anda menguji hasilnya? Gunakan tiga pertanyaan ini untuk merefleksikan proyek dan membahasnya bersama mentor.",
        },
      ],
    },
  ],
};
