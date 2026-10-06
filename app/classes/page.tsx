import Classes from "../classroom";
import { requireChatGPTUser } from "../chatgpt-auth";
export const dynamic = "force-dynamic";
export const metadata = { title: "Kelas & mentor — STEM Studio" };
async function Protected({ classId }: { classId?: string }) {
  await requireChatGPTUser(
    classId ? `/classes?class=${encodeURIComponent(classId)}` : "/classes",
  );
  return <Classes />;
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const params = await searchParams;
  return (
    <Protected
      classId={typeof params.class === "string" ? params.class : undefined}
    />
  );
}
