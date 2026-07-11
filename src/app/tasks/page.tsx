"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { DateSelector } from "@/components/DateSelector";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Board as KanbanBoard } from "@/components/tasks/Board";
import { TaskModal } from "@/components/tasks/TaskModal";
import { TeamBoardBar } from "@/components/workspace/TeamBoardBar";
import { ManageTeamModal } from "@/components/workspace/ManageTeamModal";
import {
  createTag,
  createTask,
  createTeam,
  deleteTask,
  fetchBoards,
  fetchMembers,
  fetchTags,
  fetchTasks,
  fetchTeams,
  updateTask,
} from "@/lib/api";
import type { Board, Member, Tag, Task, TaskInput, TaskStatus, Team } from "@/lib/types";
import { useDateStore } from "@/store/useDateStore";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

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

function CreateTeamModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onCreate(name.trim());
      setName("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New team">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="team-name">
            Team name
          </label>
          <input
            id="team-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Product"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create team"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TasksView() {
  const { toast } = useToast();
  const { selectedDate, setSelectedDate, shiftDays, goToToday } = useDateStore();
  const { selectedTeamId, selectedBoardId, setTeam, setBoard } = useWorkspaceStore();

  const [teams, setTeams] = useState<Team[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [modalStatus, setModalStatus] = useState<TaskStatus>("todo");
  const [manageOpen, setManageOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [filterTagIds, setFilterTagIds] = useState<number[]>([]);

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) ?? null,
    [teams, selectedTeamId]
  );
  const isOwner = selectedTeam?.role === "owner";
  const selectedBoard = useMemo(
    () => boards.find((b) => b.id === selectedBoardId) ?? null,
    [boards, selectedBoardId]
  );

  // 1. Load teams once, and pick one if the current selection is stale.
  useEffect(() => {
    let active = true;
    setLoadingWorkspace(true);
    fetchTeams()
      .then((data) => {
        if (!active) return;
        setTeams(data);
        if (!data.some((t) => t.id === selectedTeamId)) setTeam(data[0]?.id ?? null);
      })
      .catch(() => toast("Couldn't load your teams.", "error"))
      .finally(() => active && setLoadingWorkspace(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. When the team changes, load its boards, tags and members.
  useEffect(() => {
    if (selectedTeamId == null) {
      setBoards([]);
      setTags([]);
      setMembers([]);
      return;
    }
    fetchBoards(selectedTeamId).then(setBoards).catch(() => setBoards([]));
    fetchTags(selectedTeamId).then(setTags).catch(() => setTags([]));
    fetchMembers(selectedTeamId).then(setMembers).catch(() => setMembers([]));
  }, [selectedTeamId]);

  // 3. Keep a valid board selected as the board list changes.
  useEffect(() => {
    if (boards.length === 0) {
      if (selectedBoardId !== null) setBoard(null);
      return;
    }
    if (!boards.some((b) => b.id === selectedBoardId)) setBoard(boards[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards]);

  const loadTasks = useCallback(async (boardId: number, date: string) => {
    setLoading(true);
    setError(false);
    try {
      setTasks(await fetchTasks(boardId, date));
    } catch {
      setError(true);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 4. Load tasks for the selected board + date.
  useEffect(() => {
    if (selectedBoardId == null) {
      setTasks([]);
      setLoading(false);
      return;
    }
    loadTasks(selectedBoardId, selectedDate);
  }, [selectedBoardId, selectedDate, loadTasks]);

  const filtersActive = query.trim() !== "" || filterTagIds.length > 0;
  const visibleTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesQuery =
        !q ||
        task.title.toLowerCase().includes(q) ||
        task.description.toLowerCase().includes(q);
      const matchesTags =
        filterTagIds.length === 0 ||
        filterTagIds.every((id) => task.tags.some((tag) => tag.id === id));
      return matchesQuery && matchesTags;
    });
  }, [tasks, query, filterTagIds]);

  function toggleFilterTag(id: number) {
    setFilterTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }
  function clearFilters() {
    setQuery("");
    setFilterTagIds([]);
  }

  function openCreate(status: TaskStatus) {
    setEditingTask(null);
    setModalStatus(status);
    setModalOpen(true);
  }
  function openEdit(task: Task) {
    setEditingTask(task);
    setModalOpen(true);
  }

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
    return tasks.filter((t) => t.status === status).reduce((m, t) => Math.max(m, t.order), -1) + 1;
  }

  async function handleSubmit(input: TaskInput, id?: number) {
    if (id) {
      const previous = tasks;
      const existing = tasks.find((t) => t.id === id);
      if (existing) setTasks((prev) => prev.map((t) => (t.id === id ? applyInput(existing, input) : t)));
      try {
        const updated = await updateTask(id, input);
        setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
      } catch {
        setTasks(previous);
        toast("Couldn't save changes — reverted.", "error");
      }
      return;
    }

    const now = new Date().toISOString();
    const tempId = -Date.now();
    const optimistic: Task = {
      id: tempId,
      board: input.board,
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

  async function restoreTask(task: Task) {
    if (task.due_date === selectedDate) setTasks((prev) => [...prev, task]);
    try {
      const recreated = await createTask({
        board: task.board,
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
    if (selectedTeamId == null) throw new Error("no team");
    try {
      const tag = await createTag(selectedTeamId, name);
      setTags((prev) => [...prev, tag]);
      return tag;
    } catch {
      toast("Couldn't create the tag.", "error");
      throw new Error("tag failed");
    }
  }

  async function handleCreateTeam(name: string) {
    try {
      const team = await createTeam(name);
      setTeams((prev) => [...prev, team]);
      setTeam(team.id);
      setCreateTeamOpen(false);
      toast("Team created.", "success");
    } catch {
      toast("Couldn't create the team.", "error");
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
              Organize work across your team&apos;s boards, filtered by date.
            </p>
          </div>
          <Button onClick={() => openCreate("todo")} disabled={!selectedBoard}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New task
          </Button>
        </div>

        {loadingWorkspace ? (
          <BoardSkeleton />
        ) : teams.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
            <h2 className="text-lg font-semibold text-gray-900">Create your first team</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
              Teams hold your Kanban boards. Create one to get started — you can add members and boards next.
            </p>
            <Button className="mt-4" onClick={() => setCreateTeamOpen(true)}>
              New team
            </Button>
          </div>
        ) : (
          <>
            <TeamBoardBar
              teams={teams}
              boards={boards}
              selectedTeamId={selectedTeamId}
              selectedBoardId={selectedBoardId}
              isOwner={!!isOwner}
              onSelectTeam={setTeam}
              onSelectBoard={setBoard}
              onCreateTeam={() => setCreateTeamOpen(true)}
              onManage={() => setManageOpen(true)}
            />

            {!selectedBoard ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
                <p className="text-sm text-gray-500">
                  {isOwner
                    ? "This team has no boards yet. Open Manage to create one."
                    : "No boards have been shared with you in this team yet."}
                </p>
                {isOwner && (
                  <Button variant="secondary" className="mt-4" onClick={() => setManageOpen(true)}>
                    Manage team
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <DateSelector
                    value={selectedDate}
                    onChange={setSelectedDate}
                    onShift={shiftDays}
                    onToday={goToToday}
                  />
                </div>

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
                              on ? "bg-teal-600 text-white" : "bg-teal-50 text-teal-700 hover:bg-teal-100"
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
                      className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
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
                    <p className="text-sm font-medium text-red-700">We couldn&apos;t load these tasks.</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-3"
                      onClick={() => selectedBoardId && loadTasks(selectedBoardId, selectedDate)}
                    >
                      Try again
                    </Button>
                  </div>
                ) : (
                  <KanbanBoard
                    tasks={visibleTasks}
                    onChange={setTasks}
                    onAdd={openCreate}
                    onEdit={openEdit}
                    dndDisabled={filtersActive}
                  />
                )}
              </>
            )}
          </>
        )}
      </main>

      {selectedBoardId != null && (
        <TaskModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          task={editingTask}
          boardId={selectedBoardId}
          defaultStatus={modalStatus}
          defaultDate={selectedDate}
          tags={tags}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
          onCreateTag={handleCreateTag}
        />
      )}

      {selectedTeam && isOwner && (
        <ManageTeamModal
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          team={selectedTeam}
          boards={boards}
          members={members}
          onBoardsChange={setBoards}
          onMembersChange={setMembers}
        />
      )}

      <CreateTeamModal
        open={createTeamOpen}
        onClose={() => setCreateTeamOpen(false)}
        onCreate={handleCreateTeam}
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
