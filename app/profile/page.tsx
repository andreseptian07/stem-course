import Account from "../account";
import { requireChatGPTUser } from "../chatgpt-auth";
export const dynamic = "force-dynamic";
export const metadata = { title: "Profil saya — STEM Studio" };
export default async function Page() {
  await requireChatGPTUser("/profile");
  return <Account view="profile" />;
}
