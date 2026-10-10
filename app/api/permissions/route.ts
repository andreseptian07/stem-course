import {z} from "zod";
import {db,identity,json,AppError} from "@/lib/server";
import {checkAuthOrigin} from "@/lib/auth-policy";
import {readRequestText} from "@/lib/request-body";
import {changePermission,permissionEvents} from "@/lib/authorization";
export const dynamic="force-dynamic";
export async function GET(){try{return json(await permissionEvents(db(),await identity()));}catch(e){return failure(e);}}
export async function POST(req:Request){try{checkAuthOrigin(req);if(!req.headers.get("content-type")?.includes("application/json"))throw new AppError(415,"Gunakan JSON.");const body=JSON.parse(await readRequestText(req,6000));return json(await changePermission(db(),await identity(),body));}catch(e){return failure(e);}}
function failure(e:unknown){if(e instanceof AppError)return json({error:e.message},e.status);if(e instanceof SyntaxError||e instanceof z.ZodError)return json({error:"Isian hak akses tidak valid."},400);console.error("Permission request failed",e instanceof Error?e.name:"unknown");return json({error:"Perubahan izin belum berhasil. Muat ulang untuk memeriksa status."},503);}
