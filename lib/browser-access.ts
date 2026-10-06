import { redirect } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { identity, AppError } from "./server";
export async function requirePlatformAccess(returnTo: string) {
  await requireChatGPTUser(returnTo);
  try {
    return await identity();
  } catch (e) {
    if (e instanceof AppError && e.status === 403) redirect("/access");
    throw e;
  }
}
