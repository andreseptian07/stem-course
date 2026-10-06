import Account from "../account";
import { requirePlatformAccess } from "@/lib/browser-access";
export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard peserta — STEM Studio" };
async function Protected({ join }: { join?: string }) {
  await requirePlatformAccess(
    join ? `/dashboard?join=${encodeURIComponent(join)}` : "/dashboard",
  );
  return <Account view="dashboard" join={join} />;
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ join?: string }>;
}) {
  const { join } = await searchParams;
  return <Protected join={typeof join === "string" ? join : undefined} />;
}
