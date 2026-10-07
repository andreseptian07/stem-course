import AccountEmailForm from "../account-email-form";
export const metadata = { title: "Verifikasi email — Ruang STEM", robots: { index: false, follow: false } };
export default function Page() { return <AccountEmailForm mode="verify" />; }
