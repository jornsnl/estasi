import type { User } from "@/lib/data/types";

/** True once the account has a password (older local data has no activatedAt yet). */
export const isActivated = (user: Pick<User, "activatedAt" | "passwordHash">) =>
  Boolean(user.activatedAt ?? user.passwordHash);
