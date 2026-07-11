import { create } from "zustand";

// Shared, app-wide selected-date state (requirement: date state via a store).
// Kept deliberately free of any task-specific logic so <DateSelector/> stays reusable.

// Format a Date as YYYY-MM-DD using its *local* calendar components. We avoid
// toISOString() here because it converts to UTC, which can shift the calendar
// day (and silently break date arithmetic) for anyone not on UTC.
function formatISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayISO(): string {
  return formatISO(new Date());
}

interface DateState {
  selectedDate: string; // YYYY-MM-DD
  setSelectedDate: (date: string) => void;
  goToToday: () => void;
  shiftDays: (delta: number) => void;
}

export const useDateStore = create<DateState>((set) => ({
  selectedDate: todayISO(),
  setSelectedDate: (date) => set({ selectedDate: date }),
  goToToday: () => set({ selectedDate: todayISO() }),
  shiftDays: (delta) =>
    set((state) => {
      const d = new Date(`${state.selectedDate}T00:00:00`);
      d.setDate(d.getDate() + delta);
      return { selectedDate: formatISO(d) };
    }),
}));

export { todayISO };
