import type { ResearchMeta } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

export type ResearchLoadState = {
  status: "idle" | "loading" | "ready" | "error";
  meta?: ResearchMeta;
  error?: string;
};

type ResearchNoticeProps = {
  state: ResearchLoadState;
  onRetry: () => void;
};

const sourceLabels: Record<ResearchMeta["source"], string> = {
  live: "Live research",
  cache: "Cached research",
  fixture: "Sample research",
};

export function ResearchNotice({ onRetry, state }: ResearchNoticeProps) {
  if (state.status === "loading") {
    return (
      <div
        className="mb-5 flex items-center gap-3 rounded-control border border-border bg-muted px-4 py-3"
        role="status"
        aria-live="polite"
      >
        <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent" />
        <p className="text-sm text-muted-foreground">
          Researching options for your dates. This can take a few seconds.
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-control border border-danger/50 bg-danger-soft px-4 py-3"
        role="alert"
        aria-label="Research failed"
      >
        <p className="text-sm text-danger">{state.error ?? "Research could not be loaded."}</p>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (!state.meta) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <Badge variant={state.meta.source === "live" ? "success" : "estimate"}>
        {sourceLabels[state.meta.source]}
      </Badge>
      {state.meta.warnings.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium hover:text-foreground">
            Research notes ({state.meta.warnings.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {state.meta.warnings.map((warning, index) => (
              <li key={`${index}-${warning}`}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function OptionListSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded-card border border-border bg-surface p-6">
          <div className="flex gap-4">
            <Skeleton className="size-5 shrink-0" />
            <div className="w-full space-y-3">
              <Skeleton variant="text" className="w-32" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton variant="text" className="w-full" />
              <Skeleton variant="text" className="w-5/6" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
