import AuthForm from "../auth-form";
import { safeReturnPath } from "@/lib/auth-policy";
import { db } from "@/lib/server";
import { registrationEnabled } from "@/lib/registration";
export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk — STEM Studio" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  return <AuthForm mode="login" returnTo={safeReturnPath(q.return_to)} registrationEnabled={await registrationEnabled(db())} />;
}
