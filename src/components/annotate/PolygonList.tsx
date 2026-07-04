"use client";

import type { Polygon } from "@/lib/types";

interface PolygonListProps {
  polygons: Polygon[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
}

export function PolygonList({ polygons, selectedId, onSelect, onDelete }: PolygonListProps) {
  if (polygons.length === 0) {
    return (
      <p className="px-1 py-4 text-center text-xs text-gray-400">
        No shapes yet. Click on the image to place your first vertex.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {polygons.map((polygon, index) => {
        const active = polygon.id === selectedId;
        return (
          <li
            key={polygon.id}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition ${
              active ? "border-teal-500 bg-teal-50" : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(polygon.id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left focus:outline-none"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: polygon.color }}
              />
              <span className="truncate text-sm font-medium text-gray-700">
                {polygon.label || `Polygon ${index + 1}`}
              </span>
              <span className="ml-auto shrink-0 font-mono text-xs text-gray-400">
                {polygon.points.length} pts
              </span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(polygon.id)}
              aria-label={`Delete ${polygon.label || `polygon ${index + 1}`}`}
              className="rounded-md p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
