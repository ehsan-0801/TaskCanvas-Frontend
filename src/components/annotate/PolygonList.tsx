"use client";

import { useState } from "react";

import type { Polygon } from "@/lib/types";
import { POLYGON_COLORS } from "./palette";

interface PolygonListProps {
  polygons: Polygon[];
  selectedIds: number[];
  onSelect: (id: number, additive: boolean) => void;
  onDelete: (ids: number[]) => void;
  onUpdate: (id: number, patch: Partial<Pick<Polygon, "label" | "color">>) => void;
}

export function PolygonList({
  polygons,
  selectedIds,
  onSelect,
  onDelete,
  onUpdate,
}: PolygonListProps) {
  if (polygons.length === 0) {
    return (
      <p className="px-1 py-4 text-center text-xs text-gray-400">
        No shapes yet. Press D, then click on the image to place your first vertex.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {polygons.map((polygon, index) => {
        const active = selectedIds.includes(polygon.id);
        const onlyOne = active && selectedIds.length === 1;
        return (
          <li
            key={polygon.id}
            className={`rounded-lg border px-2.5 py-2 transition ${
              active ? "border-teal-500 bg-teal-50" : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => onSelect(polygon.id, e.shiftKey || e.metaKey || e.ctrlKey)}
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
                onClick={() => onDelete([polygon.id])}
                aria-label={`Delete ${polygon.label || `polygon ${index + 1}`}`}
                className="rounded-md p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
              </button>
            </div>

            {onlyOne && (
              <PolygonEditor
                key={polygon.id}
                polygon={polygon}
                placeholder={`Polygon ${index + 1}`}
                onUpdate={onUpdate}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface PolygonEditorProps {
  polygon: Polygon;
  placeholder: string;
  onUpdate: (id: number, patch: Partial<Pick<Polygon, "label" | "color">>) => void;
}

function PolygonEditor({ polygon, placeholder, onUpdate }: PolygonEditorProps) {
  const [label, setLabel] = useState(polygon.label);

  function commitLabel() {
    const next = label.trim();
    if (next !== polygon.label) onUpdate(polygon.id, { label: next });
  }

  const swatches = POLYGON_COLORS.includes(polygon.color)
    ? POLYGON_COLORS
    : [polygon.color, ...POLYGON_COLORS];

  return (
    <div className="mt-2 space-y-2 border-t border-teal-100 pt-2">
      <label className="block">
        <span className="sr-only">Label</span>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              setLabel(polygon.label);
              e.currentTarget.blur();
            }
          }}
          maxLength={100}
          placeholder={placeholder}
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
        />
      </label>

      <div className="flex flex-wrap items-center gap-1.5">
        {swatches.map((color) => {
          const chosen = color.toLowerCase() === polygon.color.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              onClick={() => {
                if (!chosen) onUpdate(polygon.id, { color });
              }}
              aria-label={`Set color ${color}`}
              aria-pressed={chosen}
              className={`h-5 w-5 rounded-full ring-1 ring-black/10 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                chosen ? "ring-2 ring-offset-2 ring-gray-900" : "hover:scale-110"
              }`}
              style={{ backgroundColor: color }}
            />
          );
        })}
        {/* Any colour, not just the presets */}
        <input
          type="color"
          value={polygon.color}
          onChange={(e) => onUpdate(polygon.id, { color: e.target.value })}
          aria-label="Pick a custom colour"
          title="Pick a custom colour"
          className="ml-auto h-6 w-7 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
        />
      </div>
    </div>
  );
}
