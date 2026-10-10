import { redirect } from "next/navigation";
import { safeReturnPath } from "./auth-policy.ts";
import { requirePermission, type Permission } from "./authorization";
import { identity, db, AppError } from "./server";
export async function requirePlatformAccess(returnTo: string, permission?: Permission, scope?: string) {
  try {
    const u=await identity();
    if(permission) await requirePermission(db(),u,permission,scope);
    if(returnTo.startsWith("/classes") && !(u.owner || u.kind === "student" || u.capabilities.tutor)) redirect("/dashboard");
    return u;
  } catch (e) {
    if (e instanceof AppError && e.status === 401)
      redirect(`/login?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`);
    if (e instanceof AppError && [403,404].includes(e.status)) redirect(permission ? "/dashboard" : "/access");
    throw e;
  }
}
