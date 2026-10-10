import {navigationUser} from "@/lib/account-navigation";
import {requirePlatformAccess} from "@/lib/browser-access";
import Certificates from "../certificates-panel";
export const dynamic="force-dynamic";
export const metadata={title:"Sertifikat — Ruang STEM"};
export default async function Page({searchParams}:{searchParams:Promise<{admin?:string}>}){const p=await searchParams;const admin=p.admin==="1";const user = await requirePlatformAccess('/certificates'+(admin?'?admin=1':''),admin?'owner':'student');return <Certificates navigation={navigationUser(user)} admin={admin}/>;}
