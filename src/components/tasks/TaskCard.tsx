"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { Task } from "@/lib/types";
import { PRIORITY_LABELS, PRIORITY_STYLES } from "./priority";

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  disabled?: boolean;
}

function formatDue(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Presentational card content, shared by the sortable card and the drag overlay.
function CardBody({ task, onEdit }: { task: Task; onEdit: (t: Task) => void }) {
  const due = formatDue(task.due_date);
  const visibleTags = task.tags.slice(0, 3);
  const overflow = task.tags.length - visibleTags.length;

  return (
    <button
      type="button"
      onClick={() => onEdit(task)}
      className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-teal-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate text-sm font-semibold text-gray-900" title={task.title}>
          {task.title}
        </h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_STYLES[task.priority]}`}
        >
          {PRIORITY_LABELS[task.priority]}
        </span>
      </div>

      {task.description && (
        <p className="mt-1.5 line-clamp-2 text-xs text-gray-500">{task.description}</p>
      )}

      {(due || task.tags.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {due && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              {due}
            </span>
          )}
          {visibleTags.map((tag) => (
            <span
              key={tag.id}
              className="rounded-full bg-teal-50 px-2.5 py-0.5 font-mono text-xs font-medium text-teal-700"
            >
              {tag.name}
            </span>
          ))}
          {overflow > 0 && (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              +{overflow}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

export function TaskCardOverlay({ task, onEdit }: { task: Task; onEdit: (t: Task) => void }) {
  return (
    <div className="scale-[1.03] cursor-grabbing rounded-2xl shadow-lg ring-1 ring-teal-300">
      <CardBody task={task} onEdit={onEdit} />
    </div>
  );
}

export function TaskCard({ task, onEdit, disabled = false }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-none">
      <CardBody task={task} onEdit={onEdit} />
    </div>
  );
}
