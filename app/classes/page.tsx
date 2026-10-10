import {navigationUser} from "@/lib/account-navigation";
import Classes from "../classroom";
import { requirePlatformAccess } from "@/lib/browser-access";
export const dynamic = "force-dynamic";
export const metadata = { title: "Kelas & mentor — Ruang STEM" };
async function Protected({
  classId,
  taskId,
}: {
  classId?: string;
  taskId?: string;
}) {
  const user = await requirePlatformAccess(
    classId
      ? `/classes?class=${encodeURIComponent(classId)}${taskId ? `&task=${encodeURIComponent(taskId)}` : ""}`
      : "/classes",
  );
  return <Classes navigation={navigationUser(user)} />;
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; task?: string }>;
}) {
  const params = await searchParams;
  return (
    <Protected
      classId={typeof params.class === "string" ? params.class : undefined}
      taskId={typeof params.task === "string" ? params.task : undefined}
    />
  );
}
