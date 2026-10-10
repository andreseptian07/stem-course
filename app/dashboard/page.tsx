import {navigationUser} from "@/lib/account-navigation";
import Account from "../account";
import { requirePlatformAccess } from "@/lib/browser-access";
export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard — Ruang STEM" };
async function Protected({ join }: { join?: string }) {
  const user = await requirePlatformAccess(
    join ? `/dashboard?join=${encodeURIComponent(join)}` : "/dashboard",
  );
  return <Account navigation={navigationUser(user)} view="dashboard" join={join} />;
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ join?: string }>;
}) {
  const { join } = await searchParams;
  return <Protected join={typeof join === "string" ? join : undefined} />;
}
