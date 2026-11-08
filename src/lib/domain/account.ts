import type { User } from "@/lib/data/types";

/** True once the account has chosen a password. */
export const isActivated = (user: Pick<User, "activatedAt">) => Boolean(user.activatedAt);
