import {restrictedNavigation} from "@/lib/browser-navigation";
import { requireSignedUser } from "@/lib/auth";
import Access from "../access-panel";
export const dynamic = "force-dynamic";
export const metadata = { title: "Akses akun — Ruang STEM" };
export default async function Page() {
  await requireSignedUser("/access");
  return <Access navigation={await restrictedNavigation()} />;
}
