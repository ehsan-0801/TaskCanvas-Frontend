"use client";

import { Button } from "@/components/ui/Button";

interface DateSelectorProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  onShift?: (delta: number) => void;
  onToday?: () => void;
}

function formatLong(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Reusable, presentational date picker. Intentionally free of any task-specific
 * logic — it only knows about a date value and how to report changes. Any page
 * can wire it to its own state (here: the shared date store).
 */
export function DateSelector({ value, onChange, onShift, onToday }: DateSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => (onShift ? onShift(-1) : undefined)}
          aria-label="Previous day"
          disabled={!onShift}
          className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => (onShift ? onShift(1) : undefined)}
          aria-label="Next day"
          disabled={!onShift}
          className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{formatLong(value)}</p>
      </div>

      <label className="sr-only" htmlFor="date-selector-input">
        Select date
      </label>
      <input
        id="date-selector-input"
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
      />

      {onToday && (
        <Button variant="secondary" size="sm" onClick={onToday}>
          Today
        </Button>
      )}
    </div>
  );
}
