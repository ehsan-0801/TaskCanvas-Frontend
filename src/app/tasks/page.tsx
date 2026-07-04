"use client";

import { useCallback, useEffect, useState } from "react";

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

  async function handleSubmit(input: TaskInput, id?: number) {
    try {
      if (id) {
        const updated = await updateTask(id, input);
        setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
        toast("Task updated.", "success");
      } else {
        const created = await createTask(input);
        // Only show it if it belongs to the day we're viewing.
        if (created.due_date === selectedDate) {
          setTasks((prev) => [...prev, created]);
        }
        toast("Task created.", "success");
      }
    } catch {
      toast("Something went wrong saving the task.", "error");
      throw new Error("save failed");
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      toast("Task deleted.", "success");
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
        <div className="mb-6">
          <DateSelector
            value={selectedDate}
            onChange={setSelectedDate}
            onShift={shiftDays}
            onToday={goToToday}
          />
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
          <Board tasks={tasks} onChange={setTasks} onAdd={openCreate} onEdit={openEdit} />
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
