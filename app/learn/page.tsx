import {navigationUser} from "@/lib/account-navigation";
import Studio from "../studio";
import { requirePlatformAccess } from "@/lib/browser-access";
export const dynamic = "force-dynamic";
export const metadata = { title: "Ruang belajar — Ruang STEM" };
async function Protected({ returnTo }: { returnTo: string }) {
  const user = await requirePlatformAccess(returnTo,returnTo.includes("view=admin") ? "owner" : "student");
  return <Studio navigation={navigationUser(user)} initialView={returnTo.includes("view=admin") ? "admin" : returnTo.includes("view=sessions") ? "sessions" : "learn"} />;
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams,
    q = new URLSearchParams();
  for (const k of ["course", "class", "lesson", "view"])
    if (typeof p[k] === "string") q.set(k, p[k] as string);
  return <Protected returnTo={"/learn" + (q.size ? "?" + q.toString() : "")} />;
}
