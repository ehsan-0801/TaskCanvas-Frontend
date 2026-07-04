"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { Tag, Task, TaskInput, TaskStatus } from "@/lib/types";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/types";

const schema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Keep the title under 200 characters"),
  description: z.string().max(2000).optional(),
  status: z.enum(["todo", "in_progress", "done"]),
  priority: z.enum(["low", "medium", "high"]),
  due_date: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  task: Task | null; // null → create mode
  defaultStatus: TaskStatus;
  defaultDate: string;
  tags: Tag[];
  onSubmit: (input: TaskInput, id?: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onCreateTag: (name: string) => Promise<Tag>;
}

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30";

export function TaskModal({
  open,
  onClose,
  task,
  defaultStatus,
  defaultDate,
  tags,
  onSubmit,
  onDelete,
  onCreateTag,
}: TaskModalProps) {
  const editing = task !== null;
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [newTag, setNewTag] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  // Re-seed the form whenever the modal opens for a different task/column.
  useEffect(() => {
    if (!open) return;
    reset({
      title: task?.title ?? "",
      description: task?.description ?? "",
      status: task?.status ?? defaultStatus,
      priority: task?.priority ?? "medium",
      due_date: task?.due_date ?? defaultDate,
    });
    setSelectedTagIds(task?.tags.map((t) => t.id) ?? []);
    setNewTag("");
    setConfirmDelete(false);
  }, [open, task, defaultStatus, defaultDate, reset]);

  function toggleTag(id: number) {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  async function handleAddTag() {
    const name = newTag.trim();
    if (!name) return;
    const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!selectedTagIds.includes(existing.id)) toggleTag(existing.id);
      setNewTag("");
      return;
    }
    try {
      const created = await onCreateTag(name);
      setSelectedTagIds((prev) => [...prev, created.id]);
      setNewTag("");
    } catch {
      /* surfaced by parent toast */
    }
  }

  async function submit(values: FormValues) {
    setSaving(true);
    try {
      await onSubmit(
        {
          title: values.title.trim(),
          description: values.description ?? "",
          status: values.status,
          priority: values.priority,
          due_date: values.due_date ? values.due_date : null,
          tag_ids: selectedTagIds,
        },
        task?.id
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!task) return;
    setDeleting(true);
    try {
      await onDelete(task.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit task" : "New task"}>
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="title">
            Title
          </label>
          <input id="title" {...register("title")} className={inputClass} autoComplete="off" />
          {errors.title && (
            <p className="mt-1 text-xs font-medium text-red-600">{errors.title.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            rows={2}
            {...register("description")}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="status">
              Status
            </label>
            <select id="status" {...register("status")} className={inputClass}>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="priority">
              Priority
            </label>
            <select id="priority" {...register("priority")} className={inputClass}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="due_date">
            Due date
          </label>
          <input id="due_date" type="date" {...register("due_date")} className={inputClass} />
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-gray-700">Tags</span>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {tags.length === 0 && (
              <span className="text-xs text-gray-400">No tags yet — add one below.</span>
            )}
            {tags.map((tag) => {
              const active = selectedTagIds.includes(tag.id);
              return (
                <button
                  type="button"
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  aria-pressed={active}
                  className={`rounded-full px-2.5 py-0.5 font-mono text-xs font-medium transition ${
                    active
                      ? "bg-teal-600 text-white"
                      : "bg-teal-50 text-teal-700 hover:bg-teal-100"
                  }`}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="Add a tag"
              className={inputClass}
            />
            <Button type="button" variant="secondary" size="sm" onClick={handleAddTag}>
              Add
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <div>
            {editing &&
              (confirmDelete ? (
                <div className="flex items-center gap-2">
                  <Button type="button" variant="danger" size="sm" onClick={remove} disabled={deleting}>
                    {deleting ? "Deleting…" : "Confirm"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              ))}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create task"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
