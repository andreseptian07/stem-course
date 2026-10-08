import { requirePlatformAccess } from "@/lib/browser-access";
import CurriculumWorkspace from "../curriculum-workspace";
export const dynamic = "force-dynamic";
export const metadata = { title: "Tim Kurikulum — Ruang STEM" };
export default async function Page() { await requirePlatformAccess('/curriculum'); return <CurriculumWorkspace />; }
