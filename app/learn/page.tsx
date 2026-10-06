import Studio from "../studio";
import { requirePlatformAccess } from "@/lib/browser-access";
export const dynamic = "force-dynamic";
export const metadata = { title: "Ruang belajar — STEM Studio" };
async function Protected({ returnTo }: { returnTo: string }) {
  await requirePlatformAccess(returnTo);
  return <Studio />;
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams,
    q = new URLSearchParams();
  for (const k of ["course", "lesson", "view"])
    if (typeof p[k] === "string") q.set(k, p[k] as string);
  return <Protected returnTo={"/learn" + (q.size ? "?" + q.toString() : "")} />;
}
