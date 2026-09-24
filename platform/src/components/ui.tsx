import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-2xl border border-line bg-surface p-6 shadow-sm", className)} {...props} />;
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info" | "warning"; children: ReactNode }) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-xl border px-4 py-3 text-sm leading-7", tones[tone])}>
      {children}
    </div>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60";
const buttonTones = {
  primary: "bg-brand text-white hover:bg-brand-strong",
  secondary: "border border-line bg-surface text-ink hover:bg-muted",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-ink-soft hover:bg-muted",
};
export type ButtonTone = keyof typeof buttonTones;

export function Button({ tone = "primary", className, ...props }: ComponentProps<"button"> & { tone?: ButtonTone }) {
  return <button className={cx(buttonBase, buttonTones[tone], className)} {...props} />;
}

export function ButtonLink({ tone = "primary", className, ...props }: ComponentProps<typeof Link> & { tone?: ButtonTone }) {
  return <Link className={cx(buttonBase, buttonTones[tone], className)} {...props} />;
}

export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${name}-hint`} className="text-xs leading-6 text-ink-soft">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} className="text-xs leading-6 text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, "aria-invalid": invalid, ...props }: ComponentProps<"input">) {
  return (
    <input
      aria-invalid={invalid}
      className={cx(
        "w-full rounded-xl border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/20",
        invalid ? "border-red-400" : "border-line",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cx(
        "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning"; children: ReactNode }) {
  const tones = {
    neutral: "bg-muted text-ink-soft",
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-900",
  };
  return <span className={cx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}
