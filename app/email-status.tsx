"use client";
import { useEffect, useState } from "react";
export default function EmailStatus() {
  const [verified, setVerified] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/account-email", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const data: { verified: boolean } = await response.json();
      if (live) setVerified(data.verified);
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  return <p>{verified === true ? "Email akun sudah diverifikasi." : <><a href="/verify-email">Verifikasi email atau kirim ulang tautan</a>{verified === false && " — email akun belum diverifikasi."}</>}</p>;
}
