import Portal from "./portal";
import { redirect } from "next/navigation";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  if (typeof q.course === "string") {
    const target = new URLSearchParams({ course: q.course });
    if (typeof q.lesson === "string") target.set("lesson", q.lesson);
    redirect(`/learn?${target.toString()}`);
  }
  return <Portal view="home" />;
}
