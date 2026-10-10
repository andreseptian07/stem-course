import TutorActivation from "../../tutor-activation";
import { getSignedUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export const metadata = { title: "Aktivasi staf — Ruang STEM", robots: { index: false, follow: false } };
export default async function Page() {
  const signed = await getSignedUser();
  return <TutorActivation signedEmail={signed?.email || null} />;
}
