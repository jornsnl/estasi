import { formatMoney } from "@/lib/ws/format";
import { installments, paymentState, type PaymentPlan } from "@/lib/ws/payments";
import type { Couple } from "@/lib/ws/types";

const moneyInput = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "" : (cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: cents % 100 ? 2 : 0, useGrouping: false });

/**
 * The agreed price and the payment plan (feedback Sabine), on "Nieuw bruidspaar"
 * and on "Gegevens & delen". With a couple, also the date of sale and what has been paid.
 */
export function CouplePaymentFields({ couple }: { couple?: Couple }) {
  const plan: PaymentPlan = couple?.payment_plan ?? "once";
  const state = couple ? paymentState(couple) : null;
  const parts = couple?.agreed_price_cents != null ? installments(couple.agreed_price_cents, plan) : null;
  return (
    <fieldset className="space-y-4">
      <legend className="mb-2 font-serif text-lg font-semibold">Prijs en betaling</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="agreedPrice">Afgesproken prijs (€)</label>
          <input id="agreedPrice" name="agreedPrice" inputMode="decimal" autoComplete="off" defaultValue={moneyInput(couple?.agreed_price_cents)} className="input" placeholder="Bijvoorbeeld 2.450" />
          <p className="hint">Het bedrag dat je met het bruidspaar hebt afgesproken. Telt mee in de omzet onder Pipeline.</p>
        </div>
        {couple && (
          <div>
            <label className="label" htmlFor="soldOn">Verkocht op</label>
            <input id="soldOn" name="soldOn" type="date" defaultValue={couple.sold_on} className="input" />
            <p className="hint">Bepaalt in welk jaar en kwartaal de omzet valt.</p>
          </div>
        )}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="payInTwo" defaultChecked={plan === "two"} className="mt-0.5 accent-[#6B1E2E]" />
        <span>Betaalt in twee keer (helft-helft). Niet aangevinkt: in één keer.</span>
      </label>
      {couple && state && (
        <div className="rounded-lg bg-cream/70 p-4 text-sm">
          <p className="font-medium">Betaald</p>
          <div className="mt-2 space-y-1.5">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="paidFirst" defaultChecked={Boolean(couple.paid_first_at)} className="accent-[#6B1E2E]" />
              {plan === "two" ? "Eerste helft betaald" : "Betaald"}
              {parts && <span className="text-muted">({formatMoney(parts[0])})</span>}
            </label>
            {plan === "two" && (
              <label className="flex items-center gap-2">
                <input type="checkbox" name="paidSecond" defaultChecked={Boolean(couple.paid_second_at)} className="accent-[#6B1E2E]" />
                Tweede helft betaald
                {parts && <span className="text-muted">({formatMoney(parts[1])})</span>}
              </label>
            )}
          </div>
          <p className="mt-3">
            {state.status === "geen_prijs" ? (
              <span className="text-muted">Vul een prijs in om te zien wat er nog openstaat.</span>
            ) : state.open > 0 ? (
              <>Nog open: <strong className="text-bordeaux">{formatMoney(state.open)}</strong> van {formatMoney(state.price)}</>
            ) : (
              <span className="text-success">Helemaal betaald ({formatMoney(state.price)})</span>
            )}
          </p>
          <p className="hint mt-1">Na het wisselen tussen één en twee keer betalen eerst opslaan; dan verschijnen de juiste vinkjes.</p>
        </div>
      )}
    </fieldset>
  );
}
