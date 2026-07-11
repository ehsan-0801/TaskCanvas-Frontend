"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  addMember,
  createBoard,
  deleteBoard,
  fetchBoardAccess,
  grantBoardAccess,
  removeMember,
  revokeBoardAccess,
} from "@/lib/api";
import type { Board, BoardGrant, Member, Team } from "@/lib/types";

interface ManageTeamModalProps {
  open: boolean;
  onClose: () => void;
  team: Team;
  boards: Board[];
  members: Member[];
  onBoardsChange: (boards: Board[]) => void;
  onMembersChange: (members: Member[]) => void;
}

type Tab = "boards" | "members";

export function ManageTeamModal({
  open,
  onClose,
  team,
  boards,
  members,
  onBoardsChange,
  onMembersChange,
}: ManageTeamModalProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("boards");

  return (
    <Modal open={open} onClose={onClose} title={`Manage “${team.name}”`}>
      <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
        {(["boards", "members"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
              tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "boards" ? (
        <BoardsTab
          team={team}
          boards={boards}
          members={members}
          onBoardsChange={onBoardsChange}
          toast={toast}
        />
      ) : (
        <MembersTab
          team={team}
          members={members}
          onMembersChange={onMembersChange}
          toast={toast}
        />
      )}
    </Modal>
  );
}

type ToastFn = ReturnType<typeof useToast>["toast"];

function BoardsTab({
  team,
  boards,
  members,
  onBoardsChange,
  toast,
}: {
  team: Team;
  boards: Board[];
  members: Member[];
  onBoardsChange: (boards: Board[]) => void;
  toast: ToastFn;
}) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const board = await createBoard(team.id, trimmed);
      onBoardsChange([...boards, board]);
      setName("");
    } catch {
      toast("Couldn't create the board.", "error");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    const previous = boards;
    onBoardsChange(boards.filter((b) => b.id !== id));
    try {
      await deleteBoard(id);
    } catch {
      onBoardsChange(previous);
      toast("Couldn't delete the board.", "error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCreate())}
          placeholder="New board name"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
        />
        <Button type="button" size="sm" onClick={handleCreate} disabled={creating}>
          Add board
        </Button>
      </div>

      <ul className="space-y-2">
        {boards.length === 0 && (
          <li className="py-2 text-center text-xs text-gray-400">No boards yet.</li>
        )}
        {boards.map((board) => (
          <li key={board.id} className="rounded-lg border border-gray-200">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-medium text-gray-800">{board.name}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === board.id ? null : board.id)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50"
                >
                  Access
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(board.id)}
                  aria-label={`Delete ${board.name}`}
                  className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                </button>
              </div>
            </div>
            {expanded === board.id && (
              <BoardAccessEditor board={board} members={members} toast={toast} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BoardAccessEditor({
  board,
  members,
  toast,
}: {
  board: Board;
  members: Member[];
  toast: ToastFn;
}) {
  const [grants, setGrants] = useState<BoardGrant[] | null>(null);

  useEffect(() => {
    fetchBoardAccess(board.id)
      .then(setGrants)
      .catch(() => toast("Couldn't load board access.", "error"));
  }, [board.id, toast]);

  const grantedIds = new Set((grants ?? []).map((g) => g.user_id));
  // The owner always has access and isn't listed as a grantable member.
  const grantable = members.filter((m) => m.role !== "owner");

  async function toggle(userId: number, on: boolean) {
    try {
      if (on) {
        const grant = await grantBoardAccess(board.id, userId);
        setGrants((prev) => [...(prev ?? []), grant]);
      } else {
        await revokeBoardAccess(board.id, userId);
        setGrants((prev) => (prev ?? []).filter((g) => g.user_id !== userId));
      }
    } catch {
      toast("Couldn't update access.", "error");
    }
  }

  return (
    <div className="border-t border-gray-100 px-3 py-2">
      <p className="mb-2 text-xs font-medium text-gray-500">Who can access this board</p>
      {grants === null ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : grantable.length === 0 ? (
        <p className="text-xs text-gray-400">Add members to grant them access.</p>
      ) : (
        <ul className="space-y-1.5">
          {grantable.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between text-sm">
              <span className="truncate text-gray-700">{m.name || m.email}</span>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={grantedIds.has(m.user_id)}
                  onChange={(e) => toggle(m.user_id, e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MembersTab({
  team,
  members,
  onMembersChange,
  toast,
}: {
  team: Team;
  members: Member[];
  onMembersChange: (members: Member[]) => void;
  toast: ToastFn;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    try {
      const member = await addMember(team.id, email.trim(), password || undefined, name.trim());
      onMembersChange([
        ...members.filter((m) => m.user_id !== member.user_id),
        member,
      ]);
      setEmail("");
      setPassword("");
      setName("");
      toast("Member added.", "success");
    } catch {
      toast("Couldn't add the member. If it's a new user, a password is required.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(userId: number) {
    const previous = members;
    onMembersChange(members.filter((m) => m.user_id !== userId));
    try {
      await removeMember(team.id, userId);
    } catch {
      onMembersChange(previous);
      toast("Couldn't remove the member.", "error");
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="space-y-2 rounded-lg border border-gray-200 p-3">
        <p className="text-xs font-medium text-gray-500">
          Add a member by email. For a new account, set a password they&apos;ll log in with.
        </p>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="member@example.com"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
        />
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="text"
            placeholder="Password (new users)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
          />
        </div>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Adding…" : "Add member"}
        </Button>
      </form>

      <ul className="space-y-1.5">
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800">{m.name || m.email}</p>
              <p className="truncate text-xs text-gray-400">{m.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.role === "owner" ? "bg-teal-50 text-teal-700" : "bg-gray-100 text-gray-500"}`}>
                {m.role}
              </span>
              {m.role !== "owner" && (
                <button
                  type="button"
                  onClick={() => handleRemove(m.user_id)}
                  aria-label={`Remove ${m.email}`}
                  className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
