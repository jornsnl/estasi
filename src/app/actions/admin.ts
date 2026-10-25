"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { audit } from "@/lib/academy";
import { newToken } from "@/lib/auth/password";
import { requireOwner } from "@/lib/auth/session";
import { getStore, type Enrollment, type PackageType, type PracticalStatus } from "@/lib/data";
import { accessStatus, addMonths, ACCESS_MONTHS, pause, resume } from "@/lib/domain/access";
import { storeUpload, UploadError } from "@/lib/uploads";
import { formatDate } from "@/lib/util/format";
import { newId } from "@/lib/util/id";

const SETUP_DAYS = 7;
const str = (formData: FormData, name: string, max = 500) => String(formData.get(name) ?? "").trim().slice(0, max);

function done(path: string, message: string, isError = false): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${isError ? "fout" : "melding"}=${encodeURIComponent(message)}`);
}

const studentPath = (userId: string) => `/beheer/cursisten/${userId}`;

export async function createStudent(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const name = str(formData, "name", 120);
  const email = str(formData, "email", 200).toLowerCase();
  const pkg = (str(formData, "package") === "B" ? "B" : "A") as PackageType;
  const purchasedInput = str(formData, "purchasedAt");
  const purchasedAt = purchasedInput ? new Date(`${purchasedInput}T12:00:00Z`).toISOString() : new Date().toISOString();

  if (!name || !/^\S+@\S+\.\S+$/.test(email)) done("/beheer/cursisten/nieuw", "Vul een naam en een geldig e-mailadres in.", true);
  if (await store.getUserByEmail(email)) done("/beheer/cursisten/nieuw", "Er bestaat al een account met dit e-mailadres.", true);
  if (pkg === "B" && !(await store.getSettings()).practicalSpotsAvailable) {
    done("/beheer/cursisten/nieuw", "Er zijn geen praktijkplekken beschikbaar. Zet ze eerst open bij Instellingen.", true);
  }

  const now = new Date().toISOString();
  const userId = newId();
  await store.createUser({
    id: userId,
    email,
    name,
    role: "student",
    passwordHash: null,
    setupToken: newToken(),
    setupTokenExpiresAt: new Date(Date.now() + SETUP_DAYS * 86_400_000).toISOString(),
    createdAt: now,
    lastActiveAt: null,
  });
  await store.saveProfile({
    userId,
    phone: str(formData, "phone", 40),
    city: str(formData, "city", 120),
    companyName: str(formData, "companyName", 160),
    photoFileId: null,
    instagram: "",
    website: "",
    intro: "",
    goals: "",
    updatedAt: now,
  });
  await store.createEnrollment({
    id: newId(),
    userId,
    package: pkg,
    purchasedAt,
    endsAt: addMonths(purchasedAt, ACCESS_MONTHS),
    pausedAt: null,
    pauses: [],
    revokedAt: null,
    onlineCompletedAt: null,
    certificateReleasedAt: null,
    certificateCode: null,
    practicalStatus: "none",
    ownerNotes: str(formData, "ownerNotes", 3000),
  });
  await audit(owner, "Cursist aangemaakt", `Pakket ${pkg}, aankoopdatum ${formatDate(purchasedAt)}`, userId);
  done(studentPath(userId), "Cursist aangemaakt. Stuur de activatielink hieronder naar de cursist.");
}

export async function newSetupLink(formData: FormData) {
  const owner = await requireOwner();
  const userId = str(formData, "userId");
  await getStore().updateUser(userId, {
    setupToken: newToken(),
    setupTokenExpiresAt: new Date(Date.now() + SETUP_DAYS * 86_400_000).toISOString(),
  });
  await audit(owner, "Nieuwe activatie/herstellink gemaakt", "", userId);
  done(studentPath(userId), "Nieuwe link aangemaakt.");
}

async function loadEnrollment(formData: FormData): Promise<Enrollment> {
  const userId = str(formData, "userId");
  const enrollment = await getStore().getEnrollmentForUser(userId);
  if (!enrollment) done(studentPath(userId), "Deze cursist heeft geen inschrijving.", true);
  return enrollment;
}

/** Extend, pause, resume, revoke or restore access. */
export async function changeAccess(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const enrollment = await loadEnrollment(formData);
  const path = studentPath(enrollment.userId);
  const op = str(formData, "op");

  try {
    let patch: Partial<Enrollment>;
    let log: string;
    switch (op) {
      case "extend": {
        const months = Math.max(1, Math.min(24, Number(str(formData, "months")) || 1));
        // Extending expired access counts from today, otherwise from the current end date.
        const base = accessStatus(enrollment) === "expired" ? new Date().toISOString() : enrollment.endsAt;
        patch = { endsAt: addMonths(base, months) };
        log = `Toegang verlengd met ${months} maand(en) tot ${formatDate(patch.endsAt)}`;
        break;
      }
      case "setEnd": {
        const date = str(formData, "endsAt");
        if (!date) throw new Error("Kies een datum.");
        patch = { endsAt: new Date(`${date}T23:59:00Z`).toISOString() };
        log = `Einddatum gewijzigd van ${formatDate(enrollment.endsAt)} naar ${formatDate(patch.endsAt)}`;
        break;
      }
      case "pause":
        patch = pause(enrollment);
        log = "Toegang gepauzeerd";
        break;
      case "resume":
        patch = resume(enrollment);
        log = `Toegang hervat, nieuwe einddatum ${formatDate(patch.endsAt)}`;
        break;
      case "revoke":
        patch = { revokedAt: new Date().toISOString() };
        log = "Toegang ingetrokken";
        break;
      case "restore":
        patch = { revokedAt: null };
        log = "Intrekking ongedaan gemaakt";
        break;
      default:
        throw new Error("Onbekende actie.");
    }
    await store.updateEnrollment(enrollment.id, patch);
    await audit(owner, log, "", enrollment.userId);
    done(path, log);
  } catch (err) {
    if (err instanceof Error && !("digest" in err)) done(path, err.message, true);
    throw err;
  }
}

/** Formal completion, certificate release and the practical part. */
export async function changeCompletion(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const enrollment = await loadEnrollment(formData);
  const path = studentPath(enrollment.userId);
  const op = str(formData, "op");
  const now = new Date().toISOString();

  let patch: Partial<Enrollment>;
  let log: string;
  switch (op) {
    case "confirmOnline":
      patch = { onlineCompletedAt: now };
      log = "Online deel bevestigd als afgerond";
      break;
    case "undoOnline":
      patch = { onlineCompletedAt: null, certificateReleasedAt: null };
      log = "Bevestiging online afronding teruggedraaid";
      break;
    case "releaseCertificate":
      if (!enrollment.onlineCompletedAt) done(path, "Bevestig eerst de online afronding.", true);
      patch = {
        certificateReleasedAt: now,
        certificateCode: enrollment.certificateCode ?? `WPA-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`,
      };
      log = "Online certificaat vrijgegeven";
      break;
    case "withdrawCertificate":
      patch = { certificateReleasedAt: null };
      log = "Certificaat ingetrokken";
      break;
    case "practical": {
      const status = str(formData, "practicalStatus") as PracticalStatus;
      if (!["none", "planned", "completed"].includes(status)) done(path, "Onbekende status.", true);
      patch = { practicalStatus: status };
      log = `Praktijkstatus: ${{ none: "nog niet gepland", planned: "gepland", completed: "afgerond" }[status]}`;
      break;
    }
    case "upgrade":
      if (enrollment.package === "B") done(path, "Deze cursist heeft al pakket B.", true);
      if (!(await store.getSettings()).practicalSpotsAvailable) {
        done(path, "Er zijn geen praktijkplekken beschikbaar. Zet ze eerst open bij Instellingen.", true);
      }
      patch = { package: "B" };
      log = "Upgrade naar pakket B (online + praktijk)";
      break;
    case "notes":
      patch = { ownerNotes: str(formData, "ownerNotes", 5000) };
      log = "Notities bijgewerkt";
      break;
    default:
      done(path, "Onbekende actie.", true);
  }
  await store.updateEnrollment(enrollment.id, patch);
  if (op !== "notes") await audit(owner, log, "", enrollment.userId);
  done(path, log);
}

export async function giveFeedback(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const answer = await store.getAnswer(str(formData, "answerId"));
  if (!answer) redirect("/beheer");
  const path = `${studentPath(answer.userId)}?les=${answer.lessonId}`;
  const text = str(formData, "text", 10_000);
  if (!text) done(path, "Schrijf eerst je feedback.", true);

  let attachment = null;
  try {
    attachment = await storeUpload(formData.get("attachment"), { belongsTo: answer.userId, uploadedBy: owner.id });
  } catch (err) {
    if (err instanceof UploadError) done(path, err.message, true);
    throw err;
  }
  await store.createFeedback({
    id: newId(),
    answerId: answer.id,
    userId: answer.userId,
    authorId: owner.id,
    text,
    attachment,
    answerVersion: answer.version,
    createdAt: new Date().toISOString(),
  });
  await audit(owner, "Feedback gegeven", "", answer.userId);
  done(path, "Feedback opgeslagen. De cursist ziet deze bij de opdracht.");
}
