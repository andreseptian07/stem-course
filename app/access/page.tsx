import { requireSignedUser } from "@/lib/auth";
import Access from "../access-panel";
export const dynamic = "force-dynamic";
export const metadata = { title: "Akses akun — STEM Studio" };
export default async function Page() {
  await requireSignedUser("/access");
  return <Access />;
}
