"use client";

import { Button } from "@/components/ui/Button";
import type { Board, Team } from "@/lib/types";

interface TeamBoardBarProps {
  teams: Team[];
  boards: Board[];
  selectedTeamId: number | null;
  selectedBoardId: number | null;
  isOwner: boolean;
  onSelectTeam: (id: number) => void;
  onSelectBoard: (id: number) => void;
  onCreateTeam: () => void;
  onManage: () => void;
}

export function TeamBoardBar({
  teams,
  boards,
  selectedTeamId,
  selectedBoardId,
  isOwner,
  onSelectTeam,
  onSelectBoard,
  onCreateTeam,
  onManage,
}: TeamBoardBarProps) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
      {/* Team picker */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Team</span>
        <select
          value={selectedTeamId ?? ""}
          onChange={(e) => onSelectTeam(Number(e.target.value))}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
        >
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onCreateTeam}
          className="rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-sm font-medium text-gray-500 transition hover:border-teal-400 hover:text-teal-600"
        >
          + New team
        </button>
      </div>

      <div className="hidden h-6 w-px bg-gray-200 sm:block" />

      {/* Board tabs */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {boards.length === 0 ? (
          <span className="text-sm text-gray-400">
            {isOwner ? "No boards yet — create one via Manage." : "No boards shared with you yet."}
          </span>
        ) : (
          boards.map((board) => {
            const active = board.id === selectedBoardId;
            return (
              <button
                key={board.id}
                type="button"
                onClick={() => onSelectBoard(board.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {board.name}
              </button>
            );
          })
        )}
      </div>

      {isOwner && (
        <Button variant="secondary" size="sm" onClick={onManage}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Manage
        </Button>
      )}
    </div>
  );
}
