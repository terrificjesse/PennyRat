import { forwardRef, type HTMLAttributes } from "react";

export type CardVariant = "default" | "raised" | "muted" | "selected";
export type CardPadding = "none" | "sm" | "md" | "lg";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  padding?: CardPadding;
};

const variantClasses: Record<CardVariant, string> = {
  default: "border-border bg-surface",
  raised: "border-border bg-surface-elevated shadow-card",
  muted: "border-transparent bg-muted",
  selected: "border-accent bg-accent-soft ring-1 ring-accent/20",
};

const paddingClasses: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, padding = "md", variant = "default", ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx(
        "rounded-card border transition-[background-color,border-color,box-shadow]",
        variantClasses[variant],
        paddingClasses[padding],
        className,
      )}
      {...props}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cx("flex flex-col gap-1.5", className)} {...props} />;
  },
);

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <h3
        ref={ref}
        className={cx(
          "text-lg font-semibold leading-tight tracking-[-0.02em] text-foreground",
          className,
        )}
        {...props}
      />
    );
  },
);

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return (
    <p
      ref={ref}
      className={cx("text-sm leading-6 text-muted-foreground", className)}
      {...props}
    />
  );
});

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cx("mt-5", className)} {...props} />;
  },
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div ref={ref} className={cx("mt-5 flex flex-wrap items-center gap-3", className)} {...props} />
    );
  },
);
