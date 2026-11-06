"use server";

import { requireUser } from "@/lib/auth/session";
import { requireCouple } from "@/lib/ws/access";
import { directUploads, prepareUpload, UploadError } from "@/lib/ws/files";
import { UPLOAD_KINDS, type UploadKind } from "@/lib/ws/upload-rules";

export type UploadTicket = { ok: true; fileId: string; signedUrl: string; mime: string } | { ok: false; error: string };

/**
 * Hands out a one-time signed upload URL for one file. Only the couple
 * itself and Sabine get one for a couple; files without a couple (Sabine's
 * own photo) only Sabine. What the file is for, and whether this account may
 * do that, is checked again by the action that receives the form.
 */
export async function requestUpload(input: { coupleId: string | null; kind: UploadKind; name: string; size: number }): Promise<UploadTicket> {
  if (!directUploads()) return { ok: false, error: "Direct uploaden staat niet aan." };
  if (!input || !(input.kind in UPLOAD_KINDS) || typeof input.name !== "string" || !Number.isFinite(input.size)) {
    return { ok: false, error: "Ongeldige upload." };
  }
  let accountId: string;
  if (input.coupleId === null) {
    const user = await requireUser();
    if (user.role !== "owner") return { ok: false, error: "Geen toegang." };
    accountId = user.id;
  } else {
    accountId = (await requireCouple(input.coupleId)).account.id;
  }
  try {
    const ticket = await prepareUpload({ coupleId: input.coupleId, accountId, kind: input.kind, name: input.name, size: Math.round(input.size) });
    return { ok: true, ...ticket };
  } catch (err) {
    if (err instanceof UploadError) return { ok: false, error: err.message };
    console.error(`[ws-upload] ${(err as Error).message}`);
    return { ok: false, error: "Uploaden lukt nu niet. Probeer het later opnieuw." };
  }
}
