import { forwardRef, type HTMLAttributes } from "react";

export type BadgeVariant =
  | "neutral"
  | "primary"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "estimate";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  estimate: "border border-border-strong bg-surface text-muted-foreground",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant = "neutral", ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cx(
        "inline-flex min-h-6 w-fit shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold leading-4 tracking-[0.01em]",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
});
