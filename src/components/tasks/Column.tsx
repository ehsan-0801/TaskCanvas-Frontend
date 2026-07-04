"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import type { Task, TaskStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { TaskCard } from "./TaskCard";

interface ColumnProps {
  status: TaskStatus;
  tasks: Task[];
  onAdd: (status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  isActiveDropTarget: boolean;
}

export function Column({ status, tasks, onAdd, onEdit, isActiveDropTarget }: ColumnProps) {
  const { setNodeRef } = useDroppable({ id: status });

  return (
    <section className="flex w-full min-w-[280px] flex-col rounded-2xl border border-gray-200 bg-gray-50/60 p-3">
      <header className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900">{STATUS_LABELS[status]}</h2>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-gray-200">
            {tasks.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onAdd(status)}
          aria-label={`Add task to ${STATUS_LABELS[status]}`}
          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white hover:text-teal-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </header>

      <div
        ref={setNodeRef}
        className={`flex min-h-[120px] flex-1 flex-col gap-2.5 rounded-xl p-1 transition ${
          isActiveDropTarget ? "bg-teal-50 ring-2 ring-inset ring-teal-300" : ""
        }`}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-300 px-3 py-8 text-center">
              <p className="text-xs text-gray-400">
                No tasks in {STATUS_LABELS[status]} for this date.
              </p>
            </div>
          ) : (
            tasks.map((task) => <TaskCard key={task.id} task={task} onEdit={onEdit} />)
          )}
        </SortableContext>
      </div>
    </section>
  );
}
