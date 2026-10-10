import {navigationUser} from "@/lib/account-navigation";
import Account from "../account";
import { requirePlatformAccess } from "@/lib/browser-access";
export const dynamic = "force-dynamic";
export const metadata = { title: "Profil saya — Ruang STEM" };
export default async function Page() {
  const user = await requirePlatformAccess("/profile");
  return <Account navigation={navigationUser(user)} view="profile" />;
}
