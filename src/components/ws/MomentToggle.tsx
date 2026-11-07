"use client";

import { useState, useTransition } from "react";
import { updateMoment } from "@/app/actions/ws-meals";

/** On/off and the name of a meal moment, saved at once. */
export function MomentToggle({ coupleId, momentId, active, name }: { coupleId: string; momentId: string; active: boolean; name: string }) {
  const [on, setOn] = useState(active);
  const [, start] = useTransition();
  return (
    <span className="flex flex-1 items-center gap-2">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked);
          start(async () => {
            await updateMoment(coupleId, momentId, { active: e.target.checked });
          });
        }}
        aria-label={`${name} aan of uit`}
        className="h-4 w-4 accent-[#6B1E2E]"
      />
      <input
        defaultValue={name}
        aria-label="Naam eetmoment"
        onBlur={(e) => e.target.value !== e.target.defaultValue && start(async () => { await updateMoment(coupleId, momentId, { name: e.target.value }); })}
        className={`flex-1 rounded border border-transparent bg-transparent px-1 hover:border-line focus:border-line focus:bg-white ${on ? "" : "text-muted line-through"}`}
      />
    </span>
  );
}
