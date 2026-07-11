import { create } from "zustand";

// Tracks which team and board the user is currently viewing. Kept separate from
// the date store so each concern stays independent.
interface WorkspaceState {
  selectedTeamId: number | null;
  selectedBoardId: number | null;
  setTeam: (id: number | null) => void;
  setBoard: (id: number | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  selectedTeamId: null,
  selectedBoardId: null,
  // Switching team clears the board selection so it re-derives for the new team.
  setTeam: (id) => set({ selectedTeamId: id, selectedBoardId: null }),
  setBoard: (id) => set({ selectedBoardId: id }),
}));
