import Classes from "../classroom";
import { requirePlatformAccess } from "@/lib/browser-access";
export const dynamic = "force-dynamic";
export const metadata = { title: "Kelas & mentor — STEM Studio" };
async function Protected({
  classId,
  taskId,
}: {
  classId?: string;
  taskId?: string;
}) {
  await requirePlatformAccess(
    classId
      ? `/classes?class=${encodeURIComponent(classId)}${taskId ? `&task=${encodeURIComponent(taskId)}` : ""}`
      : "/classes",
  );
  return <Classes />;
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
