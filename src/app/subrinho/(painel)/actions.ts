"use server";

import { redirect } from "next/navigation";
import { endSession } from "@/server/auth/session";

export async function logoutSubrinho() {
  await endSession("subrinho");
  redirect("/subrinho/login");
}
