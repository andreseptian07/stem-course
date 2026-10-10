"use client";

import Link from "next/link";
import styles from "./error.module.css";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="page-error-title">
        <p className={styles.eyebrow}>Ruang STEM</p>
        <h1 id="page-error-title" className={styles.title}>Halaman belum dapat dimuat</h1>
        <p className={styles.message} role="alert">
          Terjadi gangguan saat mengambil data. Coba muat ulang halaman. Jika Anda baru menyimpan perubahan, periksa hasilnya sebelum mengirim ulang.
        </p>
        <div className={styles.actions}>
          <button onClick={retry} className={styles.retry}>Muat ulang halaman</button>
          <Link href="/dashboard" className={styles.dashboard}>Kembali ke dashboard</Link>
        </div>
      </section>
    </main>
  );
}
