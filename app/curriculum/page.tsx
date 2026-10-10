import {navigationUser} from "@/lib/account-navigation";
import { requirePlatformAccess } from "@/lib/browser-access";
import CurriculumWorkspace from "../curriculum-workspace";
export const dynamic = "force-dynamic";
export const metadata = { title: "Tim Kurikulum — Ruang STEM" };
export default async function Page({searchParams}:{searchParams:Promise<{course?:string|string[]}>}) {
  const {course} = await searchParams;
  const query = course === undefined ? '' : '?' + new URLSearchParams({course:typeof course === 'string' && course.length <= 80 ? course : ''}).toString();
  const user = await requirePlatformAccess('/curriculum'+query,'curriculum');
  return <CurriculumWorkspace navigation={navigationUser(user)} />;
}
