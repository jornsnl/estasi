"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  saveAssignmentDraft,
  submitAssignment,
  uploadAssignmentFile,
  type DraftRequest,
  type DraftState,
} from "@/app/actions/assignment";
import type { AssignmentAnswers, AssignmentBlock, AssignmentField, FieldAnswer, FileRef } from "@/lib/data/types";
import {
  acceptFor,
  allFields,
  ASSIGNMENT_LIMITS,
  compareScans,
  FEEDBACK_LIMIT,
  isFieldAnswered,
  isSubmitted,
  sameAnswers,
  STATUS_LABELS,
  UPLOAD_KINDS,
  uploadProblem,
} from "@/lib/domain/assignment";
import { ScanComparisonTable } from "./ScanComparisonTable";

export interface FeedbackItem {
  id: string;
  version: number;
  text: string;
  attachment: FileRef | null;
  sentAt: string;
}

export interface VersionItem {
  version: number;
  submittedAt: string;
  feedbackRequested: boolean;
  feedbackStatus: "nieuw" | "in_behandeling" | "afgerond" | null;
}

interface Props {
  lessonId: string;
  assignment: AssignmentBlock;
  initial: DraftState | null;
  /** Answers of the last submitted version, to tell "changes not yet submitted". */
  lastSubmitted: AssignmentAnswers | null;
  versions: VersionItem[];
  feedback: FeedbackItem[];
  /** Feedback requests still free in this module (this assignment not counted). */
  feedbackSlotsLeft: number;
  /** The first measurement when this assignment repeats an earlier one. */
  firstMeasurement: { assignment: AssignmentBlock; answers: AssignmentAnswers; submittedAt: string | null } | null;
  ownerName?: string;
  /** The owner's preview: everything can be tried out, nothing is saved or handed in. */
  preview?: boolean;
}

type SaveState = "idle" | "pending" | "saving" | "saved" | "error" | "conflict";

const DEBOUNCE_MS = 1500;

// Always Dutch time, so the server and the browser render the same text.
const ZONE = "Europe/Amsterdam";
const time = (iso: string) => new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: ZONE });
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: ZONE });

/** Answers in the form the server accepts: upload fields send the ids of the files to keep. */
function wire(assignment: AssignmentBlock, answers: AssignmentAnswers): AssignmentAnswers {
  const out: Record<string, unknown> = {};
  for (const field of allFields(assignment)) {
    const a = answers[field.id];
    if (!a) continue;
    out[field.id] = field.type === "upload" ? { keep: (a.files ?? []).map((f) => f.id) } : a;
  }
  return out as AssignmentAnswers;
}

/**
 * One assignment on the lesson page. Saves the draft by itself (1.5 seconds
 * after typing stops, when a field loses focus and when the page is left),
 * shows when it was saved, and hands it in as a new version. Saving uses the
 * draft version as a lock: when the same assignment was saved elsewhere in
 * the meantime the student chooses which version to keep.
 */
export function AssignmentForm(props: Props) {
  const { assignment, lessonId, preview } = props;
  const router = useRouter();
  const [answers, setAnswers] = useState<AssignmentAnswers>(props.initial?.draft ?? {});
  const [status, setStatus] = useState(props.initial?.status ?? "concept");
  const [feedbackRequested, setFeedbackRequested] = useState(props.initial?.feedbackRequested ?? false);
  const [question, setQuestion] = useState(props.initial?.questionForSabine ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(props.initial?.savedAt ?? null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState<string | null>(null);
  const [conflict, setConflict] = useState<DraftState | null>(null);

  const version = useRef(props.initial?.draftVersion ?? 0);
  const dirty = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest values, for saves that run after a re-render.
  const latest = useRef({ answers, feedbackRequested, question });
  latest.current = { answers, feedbackRequested, question };

  const apply = useCallback((state: DraftState) => {
    version.current = state.draftVersion;
    setStatus(state.status);
    setSavedAt(state.savedAt);
  }, []);

  /** Runs server calls one after the other, so each one starts from the version the previous one returned. */
  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(fn, fn);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  const request = useCallback(
    (force = false): DraftRequest => ({
      lessonId,
      blockId: assignment.id,
      expectedVersion: version.current,
      answers: wire(assignment, latest.current.answers),
      feedbackRequested: latest.current.feedbackRequested,
      questionForSabine: latest.current.question,
      force,
    }),
    [assignment, lessonId],
  );

  const save = useCallback(
    (force = false) =>
      enqueue(async () => {
        if (preview || (!dirty.current && !force)) return;
        if (timer.current) clearTimeout(timer.current);
        dirty.current = false;
        setSaveState("saving");
        try {
          const result = await saveAssignmentDraft(request(force));
          if (result.ok) {
            apply(result.state);
            setSaveState(dirty.current ? "pending" : "saved");
            setConflict(null);
            if (result.feedbackRefused) {
              setFeedbackRequested(false);
              setMessage({ tone: "error", text: `Je hebt in deze module al ${FEEDBACK_LIMIT} feedbackverzoeken gedaan. Je antwoorden zijn wel opgeslagen.` });
            }
          } else if (result.conflict) {
            setConflict(result.state);
            setSaveState("conflict");
          } else {
            dirty.current = true;
            setSaveState("error");
            setMessage({ tone: "error", text: result.error });
          }
        } catch {
          dirty.current = true;
          setSaveState("error");
        }
      }),
    [apply, enqueue, preview, request],
  );

  const touch = useCallback(() => {
    dirty.current = true;
    setSaveState("pending");
    setMessage(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), DEBOUNCE_MS);
  }, [save]);

  // Leaving the page: save what is pending, and warn while a save has not gone through.
  useEffect(() => {
    const flush = () => {
      if (dirty.current) void save();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        flush();
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", beforeUnload);
      flush();
    };
  }, [save]);

  const setField = (fieldId: string, patch: FieldAnswer) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: { ...prev[fieldId], ...patch } }));
    setMissing((prev) => {
      if (!prev.has(fieldId)) return prev;
      const next = new Set(prev);
      next.delete(fieldId);
      return next;
    });
    touch();
  };

  const upload = (field: Extract<AssignmentField, { type: "upload" }>, file: File) => {
    if (props.preview) {
      setMessage({ tone: "ok", text: "Voorbeeld: hier uploadt de cursist haar bestand." });
      return;
    }
    const count = answers[field.id]?.files?.length ?? 0;
    const problem = uploadProblem(field, file, count);
    if (problem) {
      setMessage({ tone: "error", text: `${file.name}: ${problem}` });
      return;
    }
    setUploading(field.id);
    setMessage(null);
    void enqueue(async () => {
      // Typed text first, so the upload never overtakes it.
      if (dirty.current) {
        dirty.current = false;
        const saved = await saveAssignmentDraft(request()).catch(() => null);
        if (saved?.ok) apply(saved.state);
        else dirty.current = true;
      }
      const data = new FormData();
      data.set("lessonId", lessonId);
      data.set("blockId", assignment.id);
      data.set("fieldId", field.id);
      data.set("file", file);
      try {
        const result = await uploadAssignmentFile(data);
        if (result.ok) {
          apply(result.state);
          const files = result.state.draft[field.id]?.files ?? [];
          setAnswers((prev) => ({ ...prev, [field.id]: { ...prev[field.id], files } }));
          setMissing((prev) => {
            const next = new Set(prev);
            next.delete(field.id);
            return next;
          });
          setSaveState(dirty.current ? "pending" : "saved");
        } else {
          setMessage({ tone: "error", text: `${file.name}: ${"error" in result ? result.error : "niet geüpload."}` });
        }
      } catch {
        setMessage({ tone: "error", text: `${file.name} is niet geüpload. Is het bestand misschien te groot? Probeer het opnieuw.` });
      } finally {
        setUploading(null);
      }
    });
  };

  const submit = () =>
    enqueue(async () => {
      if (props.preview) {
        const open = allFields(assignment).filter((f) => f.required && !isFieldAnswered(f, latest.current.answers[f.id]));
        setMissing(new Set(open.map((f) => f.id)));
        setMessage({ tone: open.length ? "error" : "ok", text: open.length ? `Voorbeeld: nog ${open.length} verplicht(e) veld(en) leeg.` : "Voorbeeld: de cursist kan deze opdracht nu indienen." });
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      dirty.current = false;
      setSaveState("saving");
      setMessage(null);
      try {
        const result = await submitAssignment(request());
        if (result.ok) {
          apply(result.state);
          setSaveState("saved");
          setMissing(new Set());
          setMessage({
            tone: "ok",
            text: `Ingediend als versie ${result.version}.${result.lessonCompleted ? " De les is hiermee afgerond." : ""}${
              result.feedbackRefused ? ` Feedback aanvragen kon niet meer: je hebt in deze module al ${FEEDBACK_LIMIT} verzoeken gedaan.` : ""
            }`,
          });
          if (result.feedbackRefused) setFeedbackRequested(false);
          router.refresh();
        } else if (result.conflict) {
          setConflict(result.state);
          setSaveState("conflict");
        } else if (result.missing) {
          apply(result.state);
          setSaveState("saved");
          setMissing(new Set(result.missing));
          setMessage({
            tone: "error",
            text: `Je antwoorden zijn opgeslagen als concept. Vul nog ${result.missing.length === 1 ? "1 verplicht veld" : `${result.missing.length} verplichte velden`} in om in te dienen.`,
          });
          document.getElementById(`veld-${result.missing[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          dirty.current = true;
          setSaveState("error");
          setMessage({ tone: "error", text: result.error });
        }
      } catch {
        dirty.current = true;
        setSaveState("error");
        setMessage({ tone: "error", text: "Indienen is niet gelukt. Controleer je verbinding en probeer het opnieuw." });
      }
    });

  const resolveConflict = (keepMine: boolean) => {
    if (!conflict) return;
    if (keepMine) {
      dirty.current = true;
      void save(true);
    } else {
      setAnswers(conflict.draft);
      setFeedbackRequested(conflict.feedbackRequested);
      setQuestion(conflict.questionForSabine);
      apply(conflict);
      dirty.current = false;
      setConflict(null);
      setSaveState("saved");
    }
  };

  const submitted = isSubmitted(status);
  const changedSinceSubmit = submitted && props.lastSubmitted !== null && !sameAnswers(wireFree(answers), wireFree(props.lastSubmitted));
  const fields = allFields(assignment);
  const requiredOpen = fields.filter((f) => f.required && !isFieldAnswered(f, answers[f.id])).length;
  const lastVersion = props.versions.at(-1);
  const feedbackLocked = !feedbackRequested && props.feedbackSlotsLeft <= 0;
  const comparison = useMemo(
    () => (props.firstMeasurement ? compareScans(props.firstMeasurement, { assignment, answers }) : []),
    [props.firstMeasurement, assignment, answers],
  );
  const singleField = assignment.parts.length === 1 && assignment.parts[0].fields.length === 1 && !assignment.title && !assignment.parts[0].title;

  return (
    <section
      id={`opdracht-${assignment.id}`}
      className="card scroll-mt-20 p-5 sm:p-6"
      onBlur={(e) => {
        // Leaving a field (not moving to another field of this assignment) saves right away.
        if (dirty.current && !e.currentTarget.contains(e.relatedTarget as Node | null)) void save();
      }}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">{assignment.graded ? "Eindopdracht" : "Opdracht"}</span>
            {assignment.requiredForLesson ? (
              <span className="inline-flex rounded-full border border-bordeaux/20 bg-bordeaux-soft px-2.5 py-0.5 text-xs font-medium text-bordeaux">Verplicht voor afronding</span>
            ) : (
              <span className="inline-flex rounded-full border border-line bg-cream px-2.5 py-0.5 text-xs font-medium text-muted">Optioneel</span>
            )}
            <StatusBadge status={status} version={lastVersion?.version} />
            {changedSinceSubmit && <span className="text-xs text-bordeaux">Wijzigingen nog niet ingediend</span>}
          </div>
          {assignment.title && <h3 className="mt-2 text-2xl">{assignment.title}</h3>}
        </div>
        {props.preview ? <span className="text-sm text-muted">Voorbeeld, er wordt niets opgeslagen</span> : <SaveIndicator state={saveState} savedAt={savedAt} onRetry={() => void save(true)} />}
      </header>
      {assignment.intro && <p className="mb-4 whitespace-pre-wrap text-[15px]">{assignment.intro}</p>}

      {conflict && (
        <div role="alert" className="mb-4 rounded-lg border border-bordeaux/30 bg-bordeaux-soft p-4 text-sm">
          <p className="font-medium text-bordeaux">Deze opdracht is intussen ergens anders opgeslagen (bijvoorbeeld in een ander tabblad of op je telefoon).</p>
          <p className="mt-1">Kies welke versie je wilt houden. Opgeslagen om {time(conflict.savedAt)}.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary px-3 py-2" onClick={() => resolveConflict(true)}>Mijn versie bewaren</button>
            <button type="button" className="btn-secondary px-3 py-2" onClick={() => resolveConflict(false)}>De opgeslagen versie laden</button>
          </div>
        </div>
      )}

      <div className="space-y-8">
        {assignment.parts.map((part, pi) => (
          <div key={part.id} className="space-y-5">
            {(part.title || part.intro) && (
              <div className={pi > 0 ? "border-t border-line pt-6" : ""}>
                {part.title && <h4 className="font-sans text-lg font-semibold">{part.title}</h4>}
                {part.intro && <p className="mt-1 whitespace-pre-wrap text-[15px] text-muted">{part.intro}</p>}
              </div>
            )}
            {part.fields.map((field) => (
              <FieldInput
                key={field.id}
                field={field}
                answer={answers[field.id]}
                missing={missing.has(field.id)}
                prominent={singleField}
                uploading={uploading === field.id}
                onChange={(patch) => setField(field.id, patch)}
                onUpload={(file) => field.type === "upload" && upload(field, file)}
              />
            ))}
          </div>
        ))}
      </div>

      {comparison.length > 0 && props.firstMeasurement && (
        <div className="mt-8 border-t border-line pt-6">
          <h4 className="font-sans text-lg font-semibold">Vergelijking met je beginmeting</h4>
          <p className="hint">
            {props.firstMeasurement.submittedAt ? `Beginmeting ingediend op ${dateTime(props.firstMeasurement.submittedAt)}.` : "Je beginmeting is nog niet ingediend; je ziet je concept."}
          </p>
          <ScanComparisonTable comparison={comparison} />
        </div>
      )}

      {assignment.feedbackAllowed && (
        <div className="mt-8 rounded-lg border border-gold/40 bg-gold-soft/40 p-4">
          <label className={`flex items-start gap-3 ${feedbackLocked ? "opacity-60" : "cursor-pointer"}`}>
            <input
              type="checkbox"
              checked={feedbackRequested}
              disabled={feedbackLocked}
              onChange={(e) => {
                setFeedbackRequested(e.target.checked);
                touch();
              }}
              className="mt-1 accent-[#722F37]"
            />
            <span>
              <span className="font-medium">Ik wil graag persoonlijke feedback ontvangen op deze opdracht.</span>
              <span className="block text-sm text-muted">
                {feedbackLocked
                  ? `Je hebt in deze module al ${FEEDBACK_LIMIT} feedbackverzoeken gedaan.`
                  : `Je kunt per module bij maximaal ${FEEDBACK_LIMIT} opdrachten feedback vragen${feedbackRequested ? "" : ` (nog ${props.feedbackSlotsLeft} over in deze module)`}. Je kunt gewoon verder terwijl je op feedback wacht.`}
              </span>
            </span>
          </label>
          {feedbackRequested && (
            <div className="mt-3">
              <label htmlFor={`vraag-${assignment.id}`} className="label">Heb je een specifieke vraag aan Sabine?</label>
              <textarea
                id={`vraag-${assignment.id}`}
                value={question}
                maxLength={ASSIGNMENT_LIMITS.question}
                rows={3}
                className="input"
                onChange={(e) => {
                  setQuestion(e.target.value);
                  touch();
                }}
              />
            </div>
          )}
        </div>
      )}

      {message && (
        <p role="status" className={`mt-5 rounded-lg p-3 text-sm ${message.tone === "ok" ? "bg-success-soft text-success" : "bg-bordeaux-soft text-bordeaux"}`}>
          {message.text}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={saveState === "saving" || uploading !== null || status === "voldoende" || (submitted && !changedSinceSubmit && status !== "verbetering_nodig")}
          onClick={() => void submit()}
        >
          {submitted ? "Opnieuw indienen" : "Opdracht indienen"}
        </button>
        <button type="button" className="btn-secondary" disabled={saveState === "saving"} onClick={() => void save(true)}>
          Concept bewaren
        </button>
        <span className="text-sm text-muted">
          {requiredOpen > 0
            ? `Nog ${requiredOpen === 1 ? "1 verplicht veld" : `${requiredOpen} verplichte velden`} in te vullen voor je kunt indienen.`
            : submitted && !changedSinceSubmit
              ? "Ingediend. Pas je iets aan, dan kun je een nieuwe versie indienen."
              : "Alles wat verplicht is, is ingevuld."}
        </span>
      </div>

      {(props.versions.length > 0 || props.feedback.length > 0) && (
        <div className="mt-6 border-t border-line pt-4">
          {props.versions.length > 0 && (
            <p className="text-xs text-muted">
              {props.versions.map((v) => `Versie ${v.version}: ${dateTime(v.submittedAt)}${v.feedbackRequested ? (v.feedbackStatus === "afgerond" ? " (feedback ontvangen)" : " (feedback aangevraagd)") : ""}`).join(" · ")}
            </p>
          )}
          {props.feedback.map((f) => (
            <div key={f.id} className="mt-3 rounded-lg border-l-2 border-gold bg-gold-soft/60 p-4">
              <p className="text-xs font-semibold tracking-wide text-gold-ink uppercase">
                Feedback van {props.ownerName ?? "je opleider"} op versie {f.version} · {dateTime(f.sentAt)}
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-[15px]">{f.text}</p>
              {f.attachment && (
                <a href={`/api/bestanden/${f.attachment.id}`} className="mt-2 inline-block text-sm text-bordeaux underline">
                  Bijlage: {f.attachment.name}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Answers without empty bits, so an untouched field and an empty one compare equal. */
function wireFree(answers: AssignmentAnswers): AssignmentAnswers {
  const out: AssignmentAnswers = {};
  for (const [id, a] of Object.entries(answers)) {
    const clean: FieldAnswer = {};
    if (a.text) clean.text = a.text;
    if (a.choice) clean.choice = a.choice;
    if (a.choices?.length) clean.choices = a.choices;
    if (a.comment) clean.comment = a.comment;
    if (typeof a.score === "number") clean.score = a.score;
    if (a.rows && Object.keys(a.rows).length) clean.rows = a.rows;
    if (a.files?.length) clean.files = a.files.map((f) => ({ id: f.id }) as FileRef);
    if (Object.keys(clean).length) out[id] = clean;
  }
  return out;
}

function StatusBadge({ status, version }: { status: DraftState["status"]; version?: number }) {
  const tone =
    status === "concept"
      ? "border-line bg-cream text-muted"
      : status === "verbetering_nodig"
        ? "border-bordeaux/20 bg-bordeaux-soft text-bordeaux"
        : "border-success/20 bg-success-soft text-success";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {STATUS_LABELS[status]}
      {status !== "concept" && version ? ` · versie ${version}` : ""}
    </span>
  );
}

function SaveIndicator({ state, savedAt, onRetry }: { state: SaveState; savedAt: string | null; onRetry: () => void }) {
  if (state === "saving") return <span role="status" className="text-sm text-muted">Opslaan…</span>;
  if (state === "pending") return <span role="status" className="text-sm text-muted">Wijzigingen…</span>;
  if (state === "error")
    return (
      <span role="status" className="text-sm text-bordeaux">
        Niet opgeslagen.{" "}
        <button type="button" className="underline" onClick={onRetry}>Opnieuw proberen</button>
      </span>
    );
  if (state === "conflict") return <span role="status" className="text-sm text-bordeaux">Niet opgeslagen</span>;
  return savedAt ? <span role="status" className="text-sm text-muted">Opgeslagen om {time(savedAt)}</span> : null;
}

function RequiredBadge({ required }: { required: boolean }) {
  return required ? (
    <span className="ml-2 inline-flex rounded-full border border-bordeaux/20 bg-bordeaux-soft px-2 py-0.5 align-middle text-[11px] font-medium text-bordeaux">Verplicht</span>
  ) : (
    <span className="ml-2 inline-flex rounded-full border border-line bg-cream px-2 py-0.5 align-middle text-[11px] font-medium text-muted">Optioneel</span>
  );
}

function FieldInput({
  field,
  answer,
  missing,
  prominent,
  uploading,
  onChange,
  onUpload,
}: {
  field: AssignmentField;
  answer: FieldAnswer | undefined;
  missing: boolean;
  prominent: boolean;
  uploading: boolean;
  onChange: (patch: FieldAnswer) => void;
  onUpload: (file: File) => void;
}) {
  const inputId = `in-${field.id}`;
  const label = (
    <>
      <span className={prominent ? "font-sans text-lg font-medium" : "font-medium"}>{field.label || "Antwoord"}</span>
      <RequiredBadge required={field.required} />
    </>
  );
  const group = field.type === "single" || field.type === "multi" || field.type === "scale" || field.type === "scale_rows" || field.type === "upload";
  return (
    <div id={`veld-${field.id}`} className={`scroll-mt-24 ${missing ? "rounded-lg border border-bordeaux/50 bg-bordeaux-soft/30 p-3" : ""}`}>
      {group ? <p className="mb-1">{label}</p> : <label htmlFor={inputId} className="mb-1 block">{label}</label>}
      {field.help && <p className="hint mb-2 whitespace-pre-wrap">{field.help}</p>}
      {missing && <p className="mb-2 text-sm text-bordeaux">Dit veld is verplicht.</p>}

      {field.type === "short" && (
        <input id={inputId} value={answer?.text ?? ""} maxLength={ASSIGNMENT_LIMITS.shortAnswer} className="input" onChange={(e) => onChange({ text: e.target.value })} />
      )}
      {field.type === "long" && (
        <textarea
          id={inputId}
          value={answer?.text ?? ""}
          rows={7}
          maxLength={ASSIGNMENT_LIMITS.answer}
          className="input min-h-40 leading-relaxed"
          placeholder="Typ hier je antwoord…"
          onChange={(e) => onChange({ text: e.target.value })}
        />
      )}
      {(field.type === "single" || field.type === "multi") && (
        <fieldset className="space-y-2">
          <legend className="sr-only">{field.label}</legend>
          {field.options.map((option) => {
            const checked = field.type === "single" ? answer?.choice === option : (answer?.choices ?? []).includes(option);
            return (
              <label key={option} className="flex cursor-pointer items-center gap-3 rounded-md border border-line px-4 py-3 has-[:checked]:border-gold has-[:checked]:bg-gold-soft/50">
                <input
                  type={field.type === "single" ? "radio" : "checkbox"}
                  name={`keuze-${field.id}`}
                  checked={checked}
                  className="accent-[#722F37]"
                  onChange={(e) => {
                    if (field.type === "single") onChange({ choice: option });
                    else {
                      const current = answer?.choices ?? [];
                      onChange({ choices: e.target.checked ? [...current, option] : current.filter((c) => c !== option) });
                    }
                  }}
                />
                <span>{option}</span>
              </label>
            );
          })}
          {field.allowComment && (
            <div className="pt-1">
              <label htmlFor={`toel-${field.id}`} className="label">Toelichting (optioneel)</label>
              <textarea id={`toel-${field.id}`} value={answer?.comment ?? ""} rows={3} maxLength={ASSIGNMENT_LIMITS.comment} className="input" onChange={(e) => onChange({ comment: e.target.value })} />
            </div>
          )}
        </fieldset>
      )}
      {field.type === "scale" && (
        <>
          {field.explanation && <ScaleExplanation text={field.explanation} />}
          <ScalePicker name={`schaal-${field.id}`} label={field.label} min={field.min} max={field.max} value={answer?.score ?? null} onChange={(score) => onChange({ score })} />
          {(field.minLabel || field.maxLabel) && (
            <p className="mt-1 flex justify-between text-xs text-muted">
              <span>{field.min} = {field.minLabel}</span>
              <span>{field.max} = {field.maxLabel}</span>
            </p>
          )}
        </>
      )}
      {field.type === "scale_rows" && (
        <>
          {field.explanation && <ScaleExplanation text={field.explanation} />}
          {field.mode === "score" && (field.minLabel || field.maxLabel) && (
            <p className="mb-2 text-xs text-muted">
              {field.min} = {field.minLabel || "laag"} · {field.max} = {field.maxLabel || "hoog"}
            </p>
          )}
          <div className="divide-y divide-line rounded-lg border border-line">
            {field.rows.map((row, i) => {
              const value = answer?.rows?.[row.id];
              return (
                <div key={row.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-[15px]">
                    <span className="text-muted">{i + 1}.</span> {row.label}
                  </span>
                  {field.mode === "score" ? (
                    <ScalePicker
                      name={`rij-${field.id}-${row.id}`}
                      label={row.label}
                      min={field.min}
                      max={field.max}
                      value={typeof value === "number" ? value : null}
                      onChange={(score) => onChange({ rows: { ...(answer?.rows ?? {}), [row.id]: score } })}
                    />
                  ) : (
                    <input
                      aria-label={row.label}
                      value={typeof value === "string" ? value : value === undefined ? "" : String(value)}
                      maxLength={ASSIGNMENT_LIMITS.rowText}
                      className="input sm:w-64"
                      onChange={(e) => onChange({ rows: { ...(answer?.rows ?? {}), [row.id]: e.target.value } })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {field.type === "upload" && (
        <div>
          {(answer?.files ?? []).length > 0 && (
            <ul className="mb-3 space-y-2">
              {(answer?.files ?? []).map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-sm">
                  <a href={`/api/bestanden/${f.id}`} target="_blank" rel="noopener noreferrer" className="break-all text-bordeaux underline">{f.name}</a>
                  <button
                    type="button"
                    className="shrink-0 text-muted underline hover:text-bordeaux"
                    onClick={() => onChange({ files: (answer?.files ?? []).filter((x) => x.id !== f.id) })}
                  >
                    Verwijderen
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(answer?.files ?? []).length < field.maxFiles && (
            <input
              type="file"
              aria-label={`Bestand uploaden: ${field.label}`}
              accept={acceptFor(field.accept)}
              disabled={uploading}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-cream file:px-3 file:py-2 file:text-ink"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onUpload(file);
              }}
            />
          )}
          <p className="hint mt-1">
            {uploading
              ? "Bezig met uploaden…"
              : `Toegestaan: ${field.accept.map((k) => UPLOAD_KINDS[k].label).join(", ")}. ${field.maxFiles === 1 ? "Eén bestand" : `Maximaal ${field.maxFiles} bestanden`}.`}
          </p>
        </div>
      )}
    </div>
  );
}

function ScaleExplanation({ text }: { text: string }) {
  return <div className="mb-3 rounded-lg bg-cream/70 p-3 text-sm whitespace-pre-wrap">{text}</div>;
}

function ScalePicker({ name, label, min, max, value, onChange }: { name: string; label: string; min: number; max: number; value: number | null; onChange: (v: number) => void }) {
  const scores = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {scores.map((score) => (
        <label
          key={score}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border border-line text-sm font-medium has-[:checked]:border-bordeaux has-[:checked]:bg-bordeaux has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold"
        >
          <input type="radio" name={name} value={score} checked={value === score} onChange={() => onChange(score)} className="sr-only" />
          {score}
        </label>
      ))}
    </div>
  );
}
