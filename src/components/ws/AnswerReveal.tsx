"use client";

import { useRef, useTransition } from "react";
import { markQuestionRead } from "@/app/actions/ws-portal";

/**
 * An answered question the couple has not opened yet. Opening it marks it as
 * read; on the next visit it is in the history.
 */
export function AnswerReveal({
  coupleId,
  questionId,
  answer,
  answeredAt,
  markRead,
}: {
  coupleId: string;
  questionId: string;
  answer: string;
  answeredAt: string;
  /** Only the couple marks as read; Sabine looking does not count. */
  markRead: boolean;
}) {
  const marked = useRef(false);
  const [, start] = useTransition();
  return (
    <details
      className="mt-3 rounded-xl border border-gold/40 bg-white p-3"
      onToggle={(e) => {
        if (!markRead || marked.current || !(e.currentTarget as HTMLDetailsElement).open) return;
        marked.current = true;
        start(() => markQuestionRead(coupleId, questionId));
      }}
    >
      <summary className="cursor-pointer text-sm font-medium text-bordeaux">Antwoord van Sabine lezen</summary>
      <p className="mt-2 text-sm whitespace-pre-line">{answer}</p>
      <p className="mt-1 text-xs text-muted">{answeredAt}</p>
    </details>
  );
}
