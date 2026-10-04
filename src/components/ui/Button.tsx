import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg" | "icon";

const base =
  "group relative inline-flex select-none items-center justify-center gap-2 overflow-hidden rounded-2xl font-medium transition duration-200 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-aurora text-ink-950 shadow-[0_10px_40px_-10px] shadow-violet/60 hover:shadow-[0_14px_50px_-8px] hover:shadow-cyan/60 hover:brightness-110",
  secondary: "glass text-fg hover:border-white/20 hover:bg-white/10",
  ghost: "text-muted hover:bg-white/5 hover:text-fg",
  danger: "border border-rose/30 bg-rose/10 text-rose hover:border-rose/50 hover:bg-rose/20",
};

const sizes: Record<ButtonSize, string> = {
  md: "h-11 px-4 text-sm",
  lg: "h-14 px-6 text-base",
  icon: "h-11 w-11 text-lg",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra = ""): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className = "",
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}
