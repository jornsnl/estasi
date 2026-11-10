"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveLeadAction } from "@/app/actions/pipeline";
import { INTEREST_LABELS, STAGES, followUpDue, STAGE_COLORS, STAGE_HINTS, STAGE_LABELS, type Interest, type Stage } from "@/lib/pipeline/rules";

export interface BoardLead {
  id: string;
  title: string;
  contactName: string;
  interest: Interest;
  sourceLabel: string;
  stage: Stage;
  position: number;
  valueLabel: string;
  valueCents: number | null;
  weddingDateLabel: string;
  nextAction: string;
  nextActionDate: string | null;
  nextActionLabel: string;
  createdLabel: string;
}

type Columns = Record<Stage, string[]>;

function toColumns(leads: BoardLead[]): Columns {
  const columns = Object.fromEntries(STAGES.map((s) => [s, [] as string[]])) as Columns;
  for (const lead of [...leads].sort((a, b) => a.position - b.position)) columns[lead.stage].push(lead.id);
  return columns;
}

const euro = (cents: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);

/**
 * The pipeline board: drag a card to another column or place (desktop), or
 * pick the stage in the menu on the card (phone, keyboard). Every move is
 * saved right away; on an error the card goes back.
 */
export function PipelineBoard({ leads, today }: { leads: BoardLead[]; today: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [columns, setColumns] = useState(() => toColumns(leads));
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ stage: Stage; index: number } | null>(null);
  const [status, setStatus] = useState("");
  // New data from the server (added, saved elsewhere) replaces the local order.
  const key = leads.map((l) => `${l.id}:${l.stage}:${l.position}`).join();
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setColumns(toColumns(leads));
  }
  const byId = new Map(leads.map((l) => [l.id, l]));

  const move = (id: string, stage: Stage, index: number) => {
    const from = STAGES.find((s) => columns[s].includes(id));
    if (!from) return;
    const target = columns[stage].filter((x) => x !== id);
    const at = Math.max(0, Math.min(index, target.length));
    if (from === stage && columns[stage].indexOf(id) === at) return;
    target.splice(at, 0, id);
    const previous = columns;
    setColumns({ ...columns, [from]: columns[from].filter((x) => x !== id), [stage]: target });
    setStatus("Opslaan…");
    start(async () => {
      const result = await moveLeadAction(id, stage, at);
      if (result.ok) {
        setStatus(`${byId.get(id)?.title ?? "Lead"} staat nu in ${STAGE_LABELS[stage]}`);
        router.refresh();
      } else {
        setColumns(previous);
        setStatus(result.error);
      }
    });
  };

  const endDrag = () => {
    setDrag(null);
    setOver(null);
  };

  return (
    <div>
      <p className="sr-only" aria-live="polite">{status}</p>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        {STAGES.map((stage) => {
          const ids = columns[stage];
          const total = ids.reduce((sum, id) => sum + (byId.get(id)?.valueCents ?? 0), 0);
          return (
            <section
              key={stage}
              aria-label={STAGE_LABELS[stage]}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                if (over?.stage !== stage) setOver({ stage, index: ids.filter((x) => x !== drag).length });
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (drag && over) move(drag, over.stage, over.index);
                endDrag();
              }}
              className={`w-[78vw] shrink-0 snap-start rounded-2xl p-2.5 transition-colors sm:w-64 ${over?.stage === stage && drag ? "bg-gold-soft" : "bg-cream-deep/70"}`}
            >
              <header className="flex items-center justify-between gap-2 px-1.5 pb-2.5 pt-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage] }} />
                  <h2 className="truncate font-sans text-sm font-semibold">{STAGE_LABELS[stage]}</h2>
                  <span className="text-xs tabular-nums text-muted">{ids.length}</span>
                </div>
                {total > 0 && <span className="text-xs tabular-nums text-muted">{euro(total)}</span>}
              </header>
              <ol className="min-h-16 space-y-2">
                {ids.map((id, i) => {
                  const lead = byId.get(id);
                  if (!lead) return null;
                  const index = ids.filter((x) => x !== drag).indexOf(id);
                  const showLine = drag && drag !== id && over?.stage === stage && over.index === index;
                  return (
                    <li
                      key={id}
                      draggable
                      onDragStart={(e) => {
                        setDrag(id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", id);
                      }}
                      onDragEnd={endDrag}
                      onDragOver={(e) => {
                        if (!drag) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const box = e.currentTarget.getBoundingClientRect();
                        const after = e.clientY > box.top + box.height / 2;
                        const at = index === -1 ? i : index + (after ? 1 : 0);
                        if (over?.stage !== stage || over.index !== at) setOver({ stage, index: at });
                      }}
                      className={`${drag === id ? "opacity-40" : ""} ${showLine ? "border-t-2 border-bordeaux pt-1" : ""}`}
                    >
                      <LeadCard lead={lead} stage={stage} today={today} onMove={(to) => move(id, to, 0)} />
                    </li>
                  );
                })}
                {ids.length === 0 && <li className="px-1.5 py-3 text-xs leading-relaxed text-muted">{STAGE_HINTS[stage]}</li>}
              </ol>
            </section>
          );
        })}
      </div>
      {status && <p className="text-xs text-muted" aria-hidden="true">{status}</p>}
    </div>
  );
}

function LeadCard({ lead, stage, today, onMove }: { lead: BoardLead; stage: Stage; today: string; onMove: (stage: Stage) => void }) {
  const overdue = followUpDue({ stage, next_action_date: lead.nextActionDate }, today);
  return (
    <div className="cursor-grab space-y-1.5 rounded-lg border border-line bg-white p-3 text-sm shadow-sm transition-colors hover:border-gold active:cursor-grabbing">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/beheer/pipeline/${lead.id}`} draggable={false} className="font-medium leading-snug hover:text-bordeaux">
          {lead.title}
        </Link>
        {lead.valueLabel && <span className="shrink-0 text-xs tabular-nums text-muted">{lead.valueLabel}</span>}
      </div>
      {lead.contactName && lead.contactName !== lead.title && <p className="text-xs text-muted">{lead.contactName}</p>}
      <p className="text-xs text-gold-ink">
        {INTEREST_LABELS[lead.interest]}
        {lead.weddingDateLabel && ` · ${lead.weddingDateLabel}`}
      </p>
      {lead.nextActionDate && (
        <p className={`text-xs ${overdue ? "text-bordeaux" : "text-muted"}`} title={lead.nextAction || undefined}>
          {overdue ? "Opvolgen: " : "Volgende stap: "}
          {lead.nextActionLabel}
          {lead.nextAction && ` · ${lead.nextAction}`}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-[11px] text-muted">
          {lead.sourceLabel} · {lead.createdLabel}
        </span>
        <label className="sr-only" htmlFor={`fase-${lead.id}`}>Fase van {lead.title}</label>
        <select
          id={`fase-${lead.id}`}
          value={stage}
          onChange={(e) => onMove(e.target.value as Stage)}
          className="max-w-28 rounded border border-line bg-cream px-1 py-0.5 text-[11px] text-muted"
          title="Naar een andere fase"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>{STAGE_LABELS[s]}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
