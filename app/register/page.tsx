import AuthForm from "../auth-form";
import { db } from "@/lib/server";
import { registrationEnabled } from "@/lib/registration";
import { safeReturnPath } from "@/lib/auth-policy";
export const dynamic = "force-dynamic";
export const metadata = { title: "Daftar — Ruang STEM" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  return <AuthForm mode="register" returnTo={safeReturnPath(q.return_to)} registrationEnabled={await registrationEnabled(db())} />;
}
