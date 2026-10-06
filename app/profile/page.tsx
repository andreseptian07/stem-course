import Account from "../account";
import { requirePlatformAccess } from "@/lib/browser-access";
export const dynamic = "force-dynamic";
export const metadata = { title: "Profil saya — STEM Studio" };
export default async function Page() {
  await requirePlatformAccess("/profile");
  return <Account view="profile" />;
}
