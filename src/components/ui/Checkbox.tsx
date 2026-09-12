"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type"> & {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    className,
    containerClassName,
    description,
    disabled,
    error,
    id,
    label,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hasLabel = label !== undefined && label !== null && label !== false;
  const hasDescription = description !== undefined && description !== null && description !== false;
  const hasError = error !== undefined && error !== null && error !== false;
  const descriptionId = hasDescription ? `${inputId}-description` : undefined;
  const errorId = hasError ? `${inputId}-error` : undefined;
  const describedBy = [ariaDescribedBy, descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  const control = (
    <>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        disabled={disabled}
        aria-describedby={describedBy}
        aria-invalid={hasError ? true : ariaInvalid}
        className={cx("peer sr-only", className)}
        {...props}
      />
      <span
        aria-hidden="true"
        className={cx(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[0.375rem] border bg-surface text-transparent shadow-control transition-colors",
          "peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-foreground",
          "peer-focus-visible:ring-[3px] peer-focus-visible:ring-focus/25",
          "peer-disabled:bg-muted peer-disabled:shadow-none",
          hasError && "border-danger",
        )}
      >
        <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
          <path
            d="m3.25 8.25 2.75 2.5 6.75-6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </span>
    </>
  );

  if (!hasLabel && !hasDescription && !hasError) {
    return <span className={cx("inline-flex", containerClassName)}>{control}</span>;
  }

  return (
    <label
      htmlFor={inputId}
      className={cx(
        "group flex w-fit items-start gap-3",
        disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer",
        containerClassName,
      )}
    >
      {control}
      <span className="flex min-w-0 flex-col gap-0.5">
        {hasLabel && <span className="text-sm font-medium leading-5 text-foreground">{label}</span>}
        {hasDescription && (
          <span id={descriptionId} className="text-sm leading-5 text-muted-foreground">
            {description}
          </span>
        )}
        {hasError && (
          <span id={errorId} className="text-sm font-medium leading-5 text-danger">
            {error}
          </span>
        )}
      </span>
    </label>
  );
});
