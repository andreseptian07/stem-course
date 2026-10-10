import {restrictedNavigation} from "@/lib/browser-navigation";
import { requireSignedUser } from "@/lib/auth";
import Notifications from "../notifications";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifikasi — Ruang STEM" };
export default async function Page() {
  await requireSignedUser("/notifications");
  return <Notifications navigation={await restrictedNavigation()} />;
}
