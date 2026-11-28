/** `users` テーブルへの最小限のアクセス（Phase 2 の認証で使う）。 */
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getDb } from "@/lib/db/client";

export type UserRecord = {
  id: number;
  email: string;
  passwordHash: string;
  createdAt: Date;
};

export async function findUserByEmail(
  email: string,
): Promise<UserRecord | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserById(id: number): Promise<UserRecord | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createUser(
  email: string,
  passwordHash: string,
): Promise<UserRecord> {
  const db = getDb();
  const rows = await db
    .insert(users)
    .values({ email, passwordHash })
    .returning({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      createdAt: users.createdAt,
    });
  const created = rows[0];
  if (!created) {
    throw new Error("failed to create user");
  }
  return created;
}
