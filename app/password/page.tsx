import AuthForm from "../auth-form";
import { requireSignedUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export const metadata = { title: "Ganti password — STEM Studio" };
export default async function Page() { await requireSignedUser("/password"); return <AuthForm mode="password" />; }
