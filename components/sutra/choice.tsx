"use client";
/**
 * Accessible selection controls for the workbench form.
 *
 * Each card wraps a real, visually hidden `<input type="radio|checkbox">`, so keyboard behaviour (arrow keys inside
 * a radio group, Space to toggle), labelling and form semantics come from the browser. Selection is controlled by
 * the caller's state. The selected state is shown by border, background AND a check mark, never by colour alone,
 * and nothing depends on the pointer.
 */
import type { ReactNode } from "react";
import { Check } from "lucide-react";

export function ChoiceCard({ type, name, id, checked, onChange, disabled, title, description, meta, invalid, describedBy }: {
  type: "radio" | "checkbox"; name?: string; id?: string; checked: boolean; onChange: () => void; disabled?: boolean;
  title: ReactNode; description?: ReactNode; meta?: ReactNode; invalid?: boolean; describedBy?: string;
}) {
  return (
    <label className={`sutra-choice relative block ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
      <input type={type} name={name} id={id} checked={checked} onChange={onChange} disabled={disabled} aria-describedby={describedBy} className="peer sr-only" />
      <div className={`flex min-h-[3.25rem] items-start gap-3 rounded-[12px] border px-4 py-3 transition-[border-color,background-color,box-shadow] duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-green-bright ${
        checked ? "border-green bg-green-soft/55 shadow-[0_0_0_1px_var(--green)]"
          : invalid ? "border-danger/70 bg-bg hover:bg-soft/40" : "border-line bg-bg hover:border-line-strong hover:bg-soft/40"}`}>
        <span aria-hidden className={`mt-0.5 grid size-5 shrink-0 place-items-center border transition-[background-color,border-color] duration-200 ${type === "radio" ? "rounded-full" : "rounded-[6px]"} ${checked ? "border-green bg-green text-bg" : "border-line-strong bg-transparent text-transparent"}`}>
          <Check className={`size-3.5 transition-[opacity,transform] duration-200 ${checked ? "scale-100 opacity-100" : "scale-50 opacity-0"}`} strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium leading-snug text-ink">{title}</span>
          {description && <span className="mt-0.5 block text-[13px] leading-snug text-ink2">{description}</span>}
        </span>
        {meta && <span className="shrink-0 pl-2 text-right font-mono text-[12px] text-muted">{meta}</span>}
      </div>
    </label>
  );
}

/** Compact version for short options such as delay lengths. */
export function ChoiceChip({ name, id, checked, onChange, disabled, children, invalid }: {
  name: string; id?: string; checked: boolean; onChange: () => void; disabled?: boolean; children: ReactNode; invalid?: boolean;
}) {
  return (
    <label className={`sutra-choice relative inline-block ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
      <input type="radio" name={name} id={id} checked={checked} onChange={onChange} disabled={disabled} className="peer sr-only" />
      <span className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-[14px] transition-[border-color,background-color,box-shadow] duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-green-bright ${
        checked ? "border-green bg-green-soft/55 font-medium text-ink shadow-[0_0_0_1px_var(--green)]"
          : invalid ? "border-danger/70 bg-bg text-ink2 hover:bg-soft/40" : "border-line bg-bg text-ink2 hover:border-line-strong hover:bg-soft/40 hover:text-ink"}`}>
        <Check aria-hidden className={`size-4 transition-[opacity,transform,width] duration-200 ${checked ? "w-4 scale-100 text-green-bright opacity-100" : "w-0 scale-50 opacity-0"}`} strokeWidth={3} />
        {children}
      </span>
    </label>
  );
}
