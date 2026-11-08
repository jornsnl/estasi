import { Badge } from "@/components/Badge";
import type { FeedbackStatus } from "@/lib/data/types";
import { FEEDBACK_STATUS_LABELS } from "@/lib/domain/feedback";

const TONE = { nieuw: "bordeaux", in_behandeling: "gold", afgerond: "success" } as const;

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  return <Badge tone={TONE[status]}>{FEEDBACK_STATUS_LABELS[status]}</Badge>;
}
