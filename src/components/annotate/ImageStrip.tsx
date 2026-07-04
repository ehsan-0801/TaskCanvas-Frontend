"use client";

import { resolveMediaUrl } from "@/lib/api";
import type { AnnotationImage } from "@/lib/types";

interface ImageStripProps {
  images: AnnotationImage[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
}

export function ImageStrip({ images, activeId, onSelect, onDelete }: ImageStripProps) {
  return (
    <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-2">
      {images.map((image) => {
        const active = image.id === activeId;
        return (
          <div
            key={image.id}
            className={`group relative shrink-0 overflow-hidden rounded-xl border-2 transition ${
              active ? "border-teal-500" : "border-transparent hover:border-gray-300"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(image.id)}
              aria-label={`Select image ${image.id}`}
              aria-pressed={active}
              className="block h-20 w-28 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              {/* Plain img — these are user uploads of arbitrary origin/size. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveMediaUrl(image.file)}
                alt={`Upload ${image.id}`}
                className="h-full w-full object-cover"
              />
            </button>
            <button
              type="button"
              onClick={() => onDelete(image.id)}
              aria-label={`Delete image ${image.id}`}
              className="absolute right-1 top-1 rounded-md bg-slate-900/60 p-1 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
