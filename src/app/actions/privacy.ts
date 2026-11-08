"use server";

import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { deleteStudent } from "@/lib/data/privacy";
import { deletionConfirmed } from "@/lib/domain/privacy";

const str = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim().slice(0, 300);

function done(path: string, message: string, isError = false): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${isError ? "fout" : "melding"}=${encodeURIComponent(message)}`);
}

/**
 * Deletes a student for good (Academy 16). Needs both confirmations: the
 * checkbox and the e-mail address typed again (plus the browser dialog).
 */
export async function deleteStudentAccount(formData: FormData) {
  const owner = await requireOwner();
  const userId = str(formData, "userId");
  const user = await getStore().getUser(userId);
  if (!user || user.role !== "student") done("/beheer", "Cursist niet gevonden.", true);
  const path = `/beheer/cursisten/${userId}`;
  if (!deletionConfirmed(user, str(formData, "confirmEmail"), formData.get("confirmed") === "on")) {
    done(path, "Niet verwijderd: vink het vakje aan en typ het e-mailadres van de cursist precies over.", true);
  }
  const result = await deleteStudent(user.id, owner.id);
  if (!result) done("/beheer", "Cursist niet gevonden.", true);
  const message = `De cursist en alle gegevens en bestanden (${result.files}) zijn definitief verwijderd.`;
  done("/beheer", result.warnings.length ? `${message} Let op: ${result.warnings.join(" ")}` : message, result.warnings.length > 0);
}
