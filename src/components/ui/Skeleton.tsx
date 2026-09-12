import { forwardRef, type HTMLAttributes } from "react";

export type SkeletonVariant = "text" | "rectangle" | "circle";

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  variant?: SkeletonVariant;
};

const variantClasses: Record<SkeletonVariant, string> = {
  text: "h-4 rounded-md",
  rectangle: "rounded-control",
  circle: "rounded-full",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { className, variant = "rectangle", ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cx("animate-pulse bg-muted", variantClasses[variant], className)}
      {...props}
    />
  );
});
