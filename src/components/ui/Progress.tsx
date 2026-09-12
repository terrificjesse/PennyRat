import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export type ProgressTone = "primary" | "accent" | "success" | "warning" | "danger";
export type ProgressSize = "sm" | "md" | "lg";

export type ProgressProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  value: number;
  max?: number;
  label?: ReactNode;
  valueLabel?: ReactNode;
  ariaLabel?: string;
  tone?: ProgressTone;
  size?: ProgressSize;
};

const toneClasses: Record<ProgressTone, string> = {
  primary: "bg-primary",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

const sizeClasses: Record<ProgressSize, string> = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress(
  {
    ariaLabel,
    className,
    label,
    max = 100,
    size = "md",
    tone = "accent",
    value,
    valueLabel,
    ...props
  },
  ref,
) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? Math.min(Math.max(value, 0), safeMax) : 0;
  const percentage = (safeValue / safeMax) * 100;
  const accessibleLabel = ariaLabel ?? (typeof label === "string" ? label : undefined);

  return (
    <div ref={ref} className={cx("w-full", className)} {...props}>
      {(label || valueLabel) && (
        <div className="mb-2 flex items-baseline justify-between gap-4 text-sm">
          <span className="font-medium text-foreground">{label}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{valueLabel}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={accessibleLabel}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={safeValue}
        className={cx("w-full overflow-hidden rounded-full bg-muted", sizeClasses[size])}
      >
        <div
          className={cx("h-full rounded-full transition-[width] duration-300 ease-out", toneClasses[tone])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
});
