import Portal from "../../portal";
export const metadata = { title: "Detail course — Ruang STEM" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Portal view="detail" courseId={id} />;
}
