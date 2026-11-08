"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { audit } from "@/lib/academy";
import { createDevAccount, deleteDevAccount, newDevSetupLink } from "@/lib/auth/dev-auth";
import { requireOwner } from "@/lib/auth/session";
import { deleteAccount, inviteAccount, resendAccess } from "@/lib/auth/supabase-auth";
import { supabaseEnabled } from "@/lib/supabase/config";
import { getStore, type Enrollment, type PackageType, type PracticalStatus } from "@/lib/data";
import { accessStatus, addMonths, ACCESS_MONTHS, pause, resume } from "@/lib/domain/access";
import { LIMITS } from "@/lib/domain/input";
import { PACKAGE_LABELS, plural } from "@/lib/domain/labels";
import { addAssignmentFeedback, getSubmissionById, getVersion, relockModule, unlockModule } from "@/lib/data/assignments";
import { storeUpload, UploadError } from "@/lib/uploads";
import { formatDate, fromDateInput } from "@/lib/util/format";
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
  const name = str(formData, "name", LIMITS.name);
  const email = str(formData, "email", LIMITS.email).toLowerCase();
  const pkg = (str(formData, "package") === "B" ? "B" : "A") as PackageType;
  const purchasedInput = str(formData, "purchasedAt");
  // Midday in Amsterdam, so the day is the same in every time zone the date is shown in.
  const purchasedAt = purchasedInput ? fromDateInput(purchasedInput, "12:00") : new Date().toISOString();

  if (!purchasedAt) done("/beheer/cursisten/nieuw", "Kies een geldige aankoopdatum.", true);
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) done("/beheer/cursisten/nieuw", "Vul een naam en een geldig e-mailadres in.", true);
  if (await store.getUserByEmail(email)) done("/beheer/cursisten/nieuw", "Er bestaat al een account met dit e-mailadres.", true);
  if (pkg === "B" && !(await store.getSettings()).practicalSpotsAvailable) {
    done("/beheer/cursisten/nieuw", "Er zijn geen praktijkplekken beschikbaar. Zet ze eerst open bij Instellingen.", true);
  }

  const now = new Date().toISOString();
  const supabase = supabaseEnabled();
  let userId: string;
  try {
    // With Supabase the account (and its id) comes from Supabase Auth, which also mails the invite.
    // The development login makes the account itself and shows the link on the student page.
    userId = supabase ? await inviteAccount(email, name) : await createDevAccount(email, name);
  } catch (err) {
    console.error(err);
    done("/beheer/cursisten/nieuw", "De uitnodiging kon niet worden verstuurd. Controleer het e-mailadres en de e-mailinstellingen in Supabase.", true);
  }
  try {
    await store.createUser({
      id: userId,
      email,
      name,
      role: "student",
      activatedAt: null,
      createdAt: now,
      lastActiveAt: null,
    });
    await store.saveProfile({
      userId,
      phone: str(formData, "phone", LIMITS.phone),
      city: str(formData, "city", LIMITS.city),
      companyName: str(formData, "companyName", LIMITS.companyName),
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
      ownerNotes: str(formData, "ownerNotes", LIMITS.ownerNotes),
    });
    if (!supabase) await newDevSetupLink(userId, SETUP_DAYS);
  } catch (err) {
    // Do not leave a half made account behind (the users row cascades away with it).
    await (supabase ? deleteAccount(userId) : deleteDevAccount(userId)).catch(() => undefined);
    throw err;
  }
  await audit(owner, "Cursist aangemaakt", `Pakket ${pkg} · ${PACKAGE_LABELS[pkg]}, aankoopdatum ${formatDate(purchasedAt)}`, userId);
  done(
    studentPath(userId),
    supabase
      ? `Cursist aangemaakt. De uitnodiging is gemaild naar ${email}.`
      : "Cursist aangemaakt. Stuur de activatielink hieronder naar de cursist.",
  );
}

export async function newSetupLink(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const userId = str(formData, "userId");
  const user = await store.getUser(userId);
  if (!user || user.role !== "student") done("/beheer", "Cursist niet gevonden.", true);

  if (supabaseEnabled()) {
    let kind: "invite" | "reset";
    try {
      kind = await resendAccess(user);
    } catch (err) {
      console.error(err);
      done(studentPath(userId), "Versturen is niet gelukt. Probeer het over een minuut opnieuw.", true);
    }
    const what = kind === "invite" ? "Nieuwe uitnodiging" : "Wachtwoord-herstellink";
    await audit(owner, `${what} gemaild`, "", userId);
    done(studentPath(userId), `${what} gemaild naar ${user.email}.`);
  }

  await newDevSetupLink(userId, SETUP_DAYS);
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
  // The overview has its own "Verlengen" button and wants to come back to the list.
  const path = str(formData, "returnTo") === "overzicht" ? "/beheer" : studentPath(enrollment.userId);
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
        log = `Toegang verlengd met ${plural(months, "maand", "maanden")} tot ${formatDate(patch.endsAt)}`;
        break;
      }
      case "setEnd": {
        // Access runs through the chosen day, Amsterdam time (23:59 UTC would show as the next day).
        const endsAt = fromDateInput(str(formData, "endsAt"), "23:59");
        if (!endsAt) throw new Error("Kies een geldige datum.");
        patch = { endsAt };
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
    const who = path === "/beheer" ? (await store.getUser(enrollment.userId))?.name : null;
    done(path, who ? `${who}: ${log.charAt(0).toLowerCase()}${log.slice(1)}` : log);
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
      log = `Upgrade naar pakket B · ${PACKAGE_LABELS.B}`;
      break;
    case "downgrade":
      // Progress is never removed: the B-only modules are hidden again and come back after a new upgrade.
      if (enrollment.package === "A") done(path, "Deze cursist heeft al pakket A.", true);
      patch = { package: "A" };
      log = `Pakket gewijzigd naar A · ${PACKAGE_LABELS.A}`;
      break;
    case "notes":
      patch = { ownerNotes: str(formData, "ownerNotes", LIMITS.ownerNotes) };
      log = "Notities bijgewerkt";
      break;
    default:
      done(path, "Onbekende actie.", true);
  }
  await store.updateEnrollment(enrollment.id, patch);
  if (op !== "notes") await audit(owner, log, "", enrollment.userId);
  done(path, log);
}

/** Feedback on one submitted version of an assignment; the student sees it with the assignment. */
export async function giveFeedback(formData: FormData) {
  const owner = await requireOwner();
  const version = await getVersion(str(formData, "versionId"));
  if (!version) redirect("/beheer");
  const submission = await getSubmissionById(version.submissionId);
  const path = `${studentPath(version.userId)}${submission ? `?les=${submission.lessonId}` : ""}`;
  const text = str(formData, "text", LIMITS.feedback);
  if (!text) done(path, "Schrijf eerst je feedback.", true);

  // A rejected attachment must not throw away the feedback that was written.
  let attachment = null;
  let attachmentError: string | null = null;
  try {
    attachment = await storeUpload(formData.get("attachment"), { belongsTo: version.userId, uploadedBy: owner.id });
  } catch (err) {
    if (!(err instanceof UploadError)) throw err;
    attachmentError = err.message;
  }
  await addAssignmentFeedback({ version, authorId: owner.id, text, attachment, send: true });
  await audit(owner, "Feedback gegeven", `versie ${version.version}`, version.userId);
  if (attachmentError) done(path, `Feedback opgeslagen, maar zonder bijlage: ${attachmentError} Geef de bijlage eventueel als extra feedback.`, true);
  done(path, "Feedback opgeslagen. De cursist ziet deze bij de opdracht.");
}

/** Opens a module for one student before the previous one is completed, or takes that back. */
export async function changeModuleUnlock(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const userId = str(formData, "userId");
  const user = await store.getUser(userId);
  const target = await store.getModule(str(formData, "moduleId"));
  if (!user || user.role !== "student" || !target) done("/beheer", "Cursist of module niet gevonden.", true);
  const path = studentPath(userId);
  if (str(formData, "op") === "lock") {
    await relockModule(userId, target.id);
    await audit(owner, "Handmatige vrijgave ingetrokken", target.title, userId);
    done(path, `Module "${target.title}" volgt weer de gewone volgorde.`);
  }
  await unlockModule(userId, target.id, owner.id);
  await audit(owner, "Module handmatig vrijgegeven", target.title, userId);
  done(path, `Module "${target.title}" is vrijgegeven voor ${user.name}.`);
}

/** Contact details of a student, as entered when the account was made. */
export async function updateStudentDetails(formData: FormData) {
  const owner = await requireOwner();
  const store = getStore();
  const userId = str(formData, "userId");
  const user = await store.getUser(userId);
  if (!user || user.role !== "student") done("/beheer", "Cursist niet gevonden.", true);
  const path = studentPath(userId);

  const name = str(formData, "name", LIMITS.name);
  if (!name) done(path, "Vul een naam in.", true);
  if (name !== user.name) await store.updateUser(userId, { name });

  const current = await store.getProfile(userId);
  await store.saveProfile({
    userId,
    photoFileId: null,
    instagram: "",
    website: "",
    intro: "",
    goals: "",
    ...current,
    phone: str(formData, "phone", LIMITS.phone),
    city: str(formData, "city", LIMITS.city),
    companyName: str(formData, "companyName", LIMITS.companyName),
    updatedAt: new Date().toISOString(),
  });

  const enrollment = await store.getEnrollmentForUser(userId);
  const purchasedInput = str(formData, "purchasedAt");
  if (enrollment && purchasedInput) {
    const purchasedAt = fromDateInput(purchasedInput, "12:00");
    if (!purchasedAt) done(path, "Kies een geldige aankoopdatum.", true);
    // Only the recorded date changes; the end date has its own field.
    if (formatDate(purchasedAt) !== formatDate(enrollment.purchasedAt)) {
      await store.updateEnrollment(enrollment.id, { purchasedAt });
      await audit(owner, `Aankoopdatum gewijzigd van ${formatDate(enrollment.purchasedAt)} naar ${formatDate(purchasedAt)}`, "", userId);
    }
  }
  await audit(owner, "Gegevens bijgewerkt", "", userId);
  done(path, "Gegevens opgeslagen.");
}
