import AuthForm from "../auth-form";
import { requireSignedUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export const metadata = { title: "Ganti password — Ruang STEM" };
export default async function Page() { await requireSignedUser("/password"); return <AuthForm mode="password" />; }
