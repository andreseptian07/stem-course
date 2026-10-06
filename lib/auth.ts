import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { runtimeDatabase } from "../db/runtime.ts";
import { sessionUser, type SignedUser } from "./auth-data.ts";
import { sessionCookie, safeReturnPath } from "./auth-policy.ts";
export async function getSignedUser(): Promise<SignedUser | null> {
  const token = (await cookies()).get(sessionCookie().name)?.value;
  if (!token) return null;
  return sessionUser(runtimeDatabase(), token);
}
export async function requireSignedUser(returnTo: string) {
  const user = await getSignedUser();
  if (!user) redirect(`/login?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`);
  return user;
}
