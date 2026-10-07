import { requirePlatformAccess } from "@/lib/browser-access";
import Certificates from "../certificates-panel";
export const dynamic = "force-dynamic";
export const metadata = { title: "Sertifikat saya — Ruang STEM" };
export default async function Page() { await requirePlatformAccess('/certificates'); return <Certificates />; }
