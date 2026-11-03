"use server";

import { redirect } from "next/navigation";
import { endSession } from "@/server/auth/session";

export async function logoutAction(): Promise<void> {
  await endSession("afiliado");
  redirect("/afiliado/login");
}
