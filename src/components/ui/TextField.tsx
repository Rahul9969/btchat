import type { InputHTMLAttributes } from "react";
import { charCount } from "@/lib/validation";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  id: string;
  label: string;
  value: string;
  maxChars: number;
  error?: string | null;
  hint?: string;
  onValueChange: (value: string) => void;
}

export function TextField({ id, label, value, maxChars, error, hint, onValueChange, ...props }: TextFieldProps) {
  const count = charCount(value.trim());
  const over = count > maxChars;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        <span className={`text-xs tabular-nums ${over ? "text-rose" : "text-subtle"}`}>
          {count}/{maxChars}
        </span>
      </div>
      <input
        id={id}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        autoComplete="off"
        className={`h-13 rounded-2xl border bg-ink-900/70 px-4 text-base text-fg placeholder:text-subtle outline-none transition focus:bg-ink-900 focus:ring-4 ${
          error
            ? "border-rose/50 focus:border-rose focus:ring-rose/15"
            : "border-white/10 focus:border-cyan/60 focus:ring-cyan/15"
        }`}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-rose">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
