import { createHash, randomBytes } from "crypto";

/** A random token for a cookie or a link; only its hash is stored. */
export const newToken = () => randomBytes(32).toString("base64url");

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
