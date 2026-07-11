"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { DateSelector } from "@/components/DateSelector";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Board } from "@/components/tasks/Board";
import { TaskModal } from "@/components/tasks/TaskModal";
import {
  createTag,
  createTask,
  deleteTask,
  fetchTags,
  fetchTasks,
  updateTask,
} from "@/lib/api";
import type { Tag, Task, TaskInput, TaskStatus } from "@/lib/types";
import { useDateStore } from "@/store/useDateStore";

function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {[0, 1, 2].map((col) => (
        <div key={col} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-3">
          <div className="mb-3 h-5 w-24 animate-pulse rounded bg-gray-200" />
          <div className="space-y-2.5">
            {[0, 1].map((c) => (
              <div key={c} className="h-24 animate-pulse rounded-2xl bg-white ring-1 ring-gray-100" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TasksView() {
  const { toast } = useToast();
  const { selectedDate, setSelectedDate, shiftDays, goToToday } = useDateStore();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [modalStatus, setModalStatus] = useState<TaskStatus>("todo");

  // Client-side filtering of the date's tasks by text and tags.
  const [query, setQuery] = useState("");
  const [filterTagIds, setFilterTagIds] = useState<number[]>([]);
  const filtersActive = query.trim() !== "" || filterTagIds.length > 0;

  const visibleTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesQuery =
        !q ||
        task.title.toLowerCase().includes(q) ||
        task.description.toLowerCase().includes(q);
      // A task must carry *all* selected tags to match.
      const matchesTags =
        filterTagIds.length === 0 ||
        filterTagIds.every((id) => task.tags.some((tag) => tag.id === id));
      return matchesQuery && matchesTags;
    });
  }, [tasks, query, filterTagIds]);

  function toggleFilterTag(id: number) {
    setFilterTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  function clearFilters() {
    setQuery("");
    setFilterTagIds([]);
  }

  const loadTasks = useCallback(
    async (date: string) => {
      setLoading(true);
      setError(false);
      try {
        const data = await fetchTasks(date);
        setTasks(data);
      } catch {
        setError(true);
        setTasks([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadTasks(selectedDate);
  }, [selectedDate, loadTasks]);

  useEffect(() => {
    fetchTags()
      .then(setTags)
      .catch(() => setTags([]));
  }, []);

  function openCreate(status: TaskStatus) {
    setEditingTask(null);
    setModalStatus(status);
    setModalOpen(true);
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setModalOpen(true);
  }

  // Merge a form input onto a task, resolving tag_ids to full Tag objects so the
  // optimistic card renders identically to the server response.
  function applyInput(base: Task, input: TaskInput): Task {
    return {
      ...base,
      title: input.title,
      description: input.description ?? "",
      status: input.status,
      priority: input.priority,
      due_date: input.due_date,
      tags: tags.filter((t) => input.tag_ids.includes(t.id)),
      updated_at: new Date().toISOString(),
    };
  }

  function nextOrder(status: TaskStatus): number {
    const inColumn = tasks.filter((t) => t.status === status);
    return inColumn.reduce((max, t) => Math.max(max, t.order), -1) + 1;
  }

  async function handleSubmit(input: TaskInput, id?: number) {
    if (id) {
      // Optimistic edit — apply immediately, roll back if the server rejects.
      const previous = tasks;
      const existing = tasks.find((t) => t.id === id);
      if (existing) {
        setTasks((prev) => prev.map((t) => (t.id === id ? applyInput(existing, input) : t)));
      }
      try {
        const updated = await updateTask(id, input);
        setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
      } catch {
        setTasks(previous);
        toast("Couldn't save changes — reverted.", "error");
      }
      return;
    }

    // Optimistic create — insert a temp card, reconcile with the server id.
    const now = new Date().toISOString();
    const tempId = -Date.now();
    const optimistic: Task = {
      id: tempId,
      title: input.title,
      description: input.description ?? "",
      status: input.status,
      priority: input.priority,
      due_date: input.due_date,
      order: nextOrder(input.status),
      tags: tags.filter((t) => input.tag_ids.includes(t.id)),
      created_at: now,
      updated_at: now,
    };
    const onThisDay = input.due_date === selectedDate;
    if (onThisDay) setTasks((prev) => [...prev, optimistic]);
    try {
      const created = await createTask(input);
      setTasks((prev) => {
        const withoutTemp = prev.filter((t) => t.id !== tempId);
        return created.due_date === selectedDate ? [...withoutTemp, created] : withoutTemp;
      });
    } catch {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      toast("Couldn't create the task.", "error");
    }
  }

  // Recreate a deleted task (undo). It gets a fresh server id, then reconciles.
  async function restoreTask(task: Task) {
    if (task.due_date === selectedDate) {
      setTasks((prev) => [...prev, task]);
    }
    try {
      const recreated = await createTask({
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date,
        tag_ids: task.tags.map((t) => t.id),
      });
      setTasks((prev) =>
        prev.some((t) => t.id === task.id)
          ? prev.map((t) => (t.id === task.id ? recreated : t))
          : prev
      );
    } catch {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      toast("Couldn't restore the task.", "error");
    }
  }

  async function handleDelete(id: number) {
    const removed = tasks.find((t) => t.id === id) ?? null;
    try {
      await deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (removed) {
        toast("Task deleted.", "success", { label: "Undo", onClick: () => restoreTask(removed) });
      } else {
        toast("Task deleted.", "success");
      }
    } catch {
      toast("Couldn't delete the task.", "error");
      throw new Error("delete failed");
    }
  }

  async function handleCreateTag(name: string) {
    try {
      const tag = await createTag(name);
      setTags((prev) => [...prev, tag]);
      return tag;
    } catch {
      toast("Couldn't create the tag.", "error");
      throw new Error("tag failed");
    }
  }

  return (
    <div className="min-h-screen bg-powder">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Task board</h1>
            <p className="mt-1 text-sm text-gray-500">
              Plan and organize your work, filtered by date.
            </p>
          </div>
          <Button onClick={() => openCreate("todo")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New task
          </Button>
        </div>

        {/* DateSelector is visually separate from the board — its independence is obvious. */}
        <div className="mb-4">
          <DateSelector
            value={selectedDate}
            onChange={setSelectedDate}
            onShift={shiftDays}
            onToday={goToToday}
          />
        </div>

        {/* Filter bar — search + tag filters, decoupled from the date state. */}
        <div className="mb-6 flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks…"
              aria-label="Search tasks by title or description"
              className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
            />
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((tag) => {
                const on = filterTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleFilterTag(tag.id)}
                    aria-pressed={on}
                    className={`rounded-full px-3 py-1 font-mono text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                      on
                        ? "bg-teal-600 text-white"
                        : "bg-teal-50 text-teal-700 hover:bg-teal-100"
                    }`}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}

          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              Clear filters
              <span className="text-gray-400">
                ({visibleTasks.length}/{tasks.length})
              </span>
            </button>
          )}
        </div>

        {loading ? (
          <BoardSkeleton />
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
            <p className="text-sm font-medium text-red-700">We couldn&apos;t load your tasks.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => loadTasks(selectedDate)}
            >
              Try again
            </Button>
          </div>
        ) : (
          <Board
            tasks={visibleTasks}
            onChange={setTasks}
            onAdd={openCreate}
            onEdit={openEdit}
            dndDisabled={filtersActive}
          />
        )}
      </main>

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={editingTask}
        defaultStatus={modalStatus}
        defaultDate={selectedDate}
        tags={tags}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        onCreateTag={handleCreateTag}
      />
    </div>
  );
}

export default function TasksPage() {
  return (
    <AuthGuard>
      <TasksView />
    </AuthGuard>
  );
}
