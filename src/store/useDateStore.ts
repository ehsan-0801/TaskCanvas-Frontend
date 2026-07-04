import { create } from "zustand";

// Shared, app-wide selected-date state (requirement: date state via a store).
// Kept deliberately free of any task-specific logic so <DateSelector/> stays reusable.

function todayISO(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
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
      return { selectedDate: d.toISOString().slice(0, 10) };
    }),
}));

export { todayISO };
