import bcrypt from "bcryptjs";

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 8) throw new Error("A senha precisa ter ao menos 8 caracteres");
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
