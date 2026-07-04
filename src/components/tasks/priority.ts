import type { TaskPriority } from "@/lib/types";

// Semantic colors reserved for priority (UI-UX-Guidance): tinted bg + dark text,
// never a solid-fill badge. Paired with a label so it doesn't rely on color alone.
export const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: "bg-green-50 text-green-700",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-red-50 text-red-700",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
