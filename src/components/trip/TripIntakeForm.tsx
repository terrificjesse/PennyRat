"use client";

import { useRef, useState, type FormEvent } from "react";
import { formatCents, parseDollarsToCents } from "@/lib/budget";
import {
  INTERESTS,
  tripIntakeSchema,
  type Interest,
  type Pace,
  type TripIntake,
} from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";

type TripIntakeFormProps = {
  initialValue?: TripIntake | null;
  onSubmit: (intake: TripIntake) => void;
};

type FormValues = {
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: string;
  budget: string;
  interests: Interest[];
  pace: Pace;
};

type IntakeErrors = Partial<Record<keyof TripIntake, string>>;

const INTEREST_LABELS: Record<Interest, string> = {
  food: "Food",
  hiking: "Hiking",
  sports: "Sports",
  family: "Family",
  sensory_friendly: "Sensory friendly",
  tourist: "Classic sights",
  nightlife: "Nightlife",
  art: "Art",
  history: "History",
  shopping: "Shopping",
};

const PACE_OPTIONS: Array<{ value: Pace; label: string; description: string }> = [
  { value: "relaxed", label: "Relaxed", description: "Two anchors a day, with room to wander." },
  { value: "balanced", label: "Balanced", description: "A full day without racing the clock." },
  { value: "packed", label: "Packed", description: "See as much as possible every day." },
];

const FIELD_MESSAGES: Record<keyof TripIntake, string> = {
  origin: "Enter where you’re leaving from.",
  destination: "Enter where you want to go.",
  startDate: "Choose a valid departure date.",
  endDate: "Choose a return date after your departure.",
  travelers: "Travelers must be a whole number from 1 to 12.",
  budgetTotal: "Enter a total budget greater than $0.",
  interests: "Choose at least one interest.",
  pace: "Choose a travel pace.",
};

const FIELD_FOCUS_SELECTORS: Record<keyof TripIntake, string> = {
  origin: "#trip-origin",
  destination: "#trip-destination",
  startDate: "#trip-start",
  endDate: "#trip-end",
  travelers: "#trip-travelers",
  budgetTotal: "#trip-budget",
  interests: "#trip-interests input",
  pace: "#trip-pace input",
};

const inputClasses =
  "min-h-11 w-full rounded-control border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-foreground shadow-control outline-none transition placeholder:text-muted-foreground/70 focus:border-accent focus:ring-[3px] focus:ring-focus/20 aria-invalid:border-danger aria-invalid:ring-danger/15";

function formValues(intake?: TripIntake | null): FormValues {
  if (!intake) {
    return {
      origin: "",
      destination: "",
      startDate: "",
      endDate: "",
      travelers: "2",
      budget: "",
      interests: [],
      pace: "balanced",
    };
  }

  return {
    origin: intake.origin,
    destination: intake.destination,
    startDate: intake.startDate,
    endDate: intake.endDate,
    travelers: String(intake.travelers),
    budget: formatCents(intake.budgetTotal).replace(/^\$/, ""),
    interests: [...intake.interests],
    pace: intake.pace,
  };
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm font-medium text-danger">
      {message}
    </p>
  );
}

export function TripIntakeForm({ initialValue, onSubmit }: TripIntakeFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<FormValues>(() => formValues(initialValue));
  const [errors, setErrors] = useState<IntakeErrors>({});

  function updateField(
    field: Exclude<keyof FormValues, "interests">,
    value: string,
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    const errorField = field === "budget" ? "budgetTotal" : field;
    setErrors((current) => ({ ...current, [errorField]: undefined }));
  }

  function updateInterest(interest: Interest, selected: boolean) {
    setValues((current) => ({
      ...current,
      interests: selected
        ? current.interests.includes(interest)
          ? current.interests
          : [...current.interests, interest]
        : current.interests.filter((value) => value !== interest),
    }));
    setErrors((current) => ({ ...current, interests: undefined }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const budgetTotal = parseDollarsToCents(values.budget);

    const parsed = tripIntakeSchema.safeParse({
      origin: values.origin.trim(),
      destination: values.destination.trim(),
      startDate: values.startDate,
      endDate: values.endDate,
      travelers: Number(values.travelers),
      budgetTotal: budgetTotal ?? -1,
      interests: values.interests,
      pace: values.pace,
    });

    if (!parsed.success) {
      const nextErrors: IntakeErrors = {};
      let firstError: keyof TripIntake | undefined;
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && field in FIELD_MESSAGES) {
          const knownField = field as keyof TripIntake;
          nextErrors[knownField] ??= FIELD_MESSAGES[knownField];
          firstError ??= knownField;
        }
      }
      setErrors(nextErrors);
      if (firstError) {
        const selector = FIELD_FOCUS_SELECTORS[firstError];
        requestAnimationFrame(() => {
          formRef.current?.querySelector<HTMLElement>(selector)?.focus();
        });
      }
      return;
    }

    setErrors({});
    onSubmit(parsed.data);
  }

  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className="space-y-7">
      {hasErrors && (
        <div role="alert" className="rounded-control border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          Check the highlighted details before building your budget.
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="trip-origin" className="mb-2 block text-sm font-semibold text-foreground">
            Leaving from
          </label>
          <input
            id="trip-origin"
            value={values.origin}
            onChange={(event) => updateField("origin", event.currentTarget.value)}
            placeholder="ORD or Chicago"
            autoComplete="off"
            aria-invalid={Boolean(errors.origin)}
            aria-describedby={errors.origin ? "trip-origin-error" : undefined}
            className={inputClasses}
          />
          <FieldError id="trip-origin-error" message={errors.origin} />
        </div>

        <div>
          <label htmlFor="trip-destination" className="mb-2 block text-sm font-semibold text-foreground">
            Going to
          </label>
          <input
            id="trip-destination"
            value={values.destination}
            onChange={(event) => updateField("destination", event.currentTarget.value)}
            placeholder="Tokyo, Japan"
            autoComplete="off"
            aria-invalid={Boolean(errors.destination)}
            aria-describedby={errors.destination ? "trip-destination-error" : undefined}
            className={inputClasses}
          />
          <FieldError id="trip-destination-error" message={errors.destination} />
        </div>

        <div>
          <label htmlFor="trip-start" className="mb-2 block text-sm font-semibold text-foreground">
            Depart
          </label>
          <input
            id="trip-start"
            type="date"
            value={values.startDate}
            onChange={(event) => updateField("startDate", event.currentTarget.value)}
            aria-invalid={Boolean(errors.startDate)}
            aria-describedby={errors.startDate ? "trip-start-error" : undefined}
            className={inputClasses}
          />
          <FieldError id="trip-start-error" message={errors.startDate} />
        </div>

        <div>
          <label htmlFor="trip-end" className="mb-2 block text-sm font-semibold text-foreground">
            Return
          </label>
          <input
            id="trip-end"
            type="date"
            min={values.startDate || undefined}
            value={values.endDate}
            onChange={(event) => updateField("endDate", event.currentTarget.value)}
            aria-invalid={Boolean(errors.endDate)}
            aria-describedby={errors.endDate ? "trip-end-error" : undefined}
            className={inputClasses}
          />
          <FieldError id="trip-end-error" message={errors.endDate} />
        </div>

        <div>
          <label htmlFor="trip-travelers" className="mb-2 block text-sm font-semibold text-foreground">
            Travelers
          </label>
          <input
            id="trip-travelers"
            type="number"
            min="1"
            max="12"
            step="1"
            inputMode="numeric"
            value={values.travelers}
            onChange={(event) => updateField("travelers", event.currentTarget.value)}
            aria-invalid={Boolean(errors.travelers)}
            aria-describedby={errors.travelers ? "trip-travelers-error" : undefined}
            className={inputClasses}
          />
          <FieldError id="trip-travelers-error" message={errors.travelers} />
        </div>

        <div>
          <label htmlFor="trip-budget" className="mb-2 block text-sm font-semibold text-foreground">
            Total trip budget
          </label>
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted-foreground">
              $
            </span>
            <input
              id="trip-budget"
              inputMode="decimal"
              value={values.budget}
              onChange={(event) => updateField("budget", event.currentTarget.value)}
              placeholder="4,200"
              aria-invalid={Boolean(errors.budgetTotal)}
              aria-describedby={errors.budgetTotal ? "trip-budget-error" : "trip-budget-hint"}
              className={`${inputClasses} pl-8 tabular-nums`}
            />
          </div>
          <p id="trip-budget-hint" className="mt-1.5 text-xs text-muted-foreground">
            Flights, stay, food, activities, and local transit included.
          </p>
          <FieldError id="trip-budget-error" message={errors.budgetTotal} />
        </div>
      </div>

      <fieldset
        id="trip-interests"
        aria-invalid={Boolean(errors.interests)}
        aria-describedby={errors.interests ? "trip-interests-error" : undefined}
      >
        <legend className="text-sm font-semibold text-foreground">What matters to you?</legend>
        <p className="mt-1 text-sm text-muted-foreground">Choose at least one. We’ll use these to shape the shortlist.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INTERESTS.map((interest) => (
            <Checkbox
              key={interest}
              label={INTEREST_LABELS[interest]}
              checked={values.interests.includes(interest)}
              onChange={(event) => updateInterest(interest, event.currentTarget.checked)}
              containerClassName="w-full rounded-control border border-border bg-surface px-3.5 py-3 transition-colors hover:border-border-strong"
            />
          ))}
        </div>
        <FieldError id="trip-interests-error" message={errors.interests} />
      </fieldset>

      <fieldset
        id="trip-pace"
        aria-invalid={Boolean(errors.pace)}
        aria-describedby={errors.pace ? "trip-pace-error" : undefined}
      >
        <legend className="text-sm font-semibold text-foreground">Travel pace</legend>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {PACE_OPTIONS.map((option) => (
            <label key={option.value} className="cursor-pointer">
              <input
                type="radio"
                name="pace"
                value={option.value}
                checked={values.pace === option.value}
                onChange={() => updateField("pace", option.value)}
                className="peer sr-only"
              />
              <span className="block h-full rounded-control border border-border bg-surface p-4 transition-colors peer-checked:border-accent peer-checked:bg-accent-soft peer-focus-visible:ring-[3px] peer-focus-visible:ring-focus/25">
                <span className="block text-sm font-semibold text-foreground">{option.label}</span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
        <FieldError id="trip-pace-error" message={errors.pace} />
      </fieldset>

      <Button type="submit" size="lg">
        {initialValue ? "Update trip budget" : "Build my budget"}
      </Button>
    </form>
  );
}
