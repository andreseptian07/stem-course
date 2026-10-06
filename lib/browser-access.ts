import { redirect } from "next/navigation";
import { requireSignedUser } from "./auth.ts";
import { identity, AppError } from "./server";
export async function requirePlatformAccess(returnTo: string) {
  await requireSignedUser(returnTo);
  try {
    return await identity();
  } catch (e) {
    if (e instanceof AppError && e.status === 403) redirect("/access");
    throw e;
  }
}
