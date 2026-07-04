"use client";

import { useRef, useState } from "react";

interface UploadZoneProps {
  onFiles: (files: File[]) => void;
  progress: Record<string, number>; // filename → percent (0–100)
  compact?: boolean;
}

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function UploadZone({ onFiles, progress, compact }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList);
    const valid = files.filter((f) => ACCEPTED.includes(f.type));
    const invalid = files.filter((f) => !ACCEPTED.includes(f.type));

    if (invalid.length > 0) {
      setRejected(
        `Skipped ${invalid.length} non-image file${invalid.length > 1 ? "s" : ""} (PNG, JPG, WEBP, or GIF only).`
      );
    } else {
      setRejected(null);
    }
    if (valid.length > 0) onFiles(valid);
  }

  const uploading = Object.entries(progress);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
          compact ? "px-4 py-6" : "px-6 py-12"
        } ${dragging ? "border-teal-400 bg-teal-50" : "border-gray-300 bg-white hover:border-gray-400"}`}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-100 text-teal-600">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
        </span>
        <p className="mt-3 text-sm font-semibold text-gray-900">
          {compact ? "Upload more images" : "Drag & drop images here"}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          or <span className="font-medium text-teal-600">browse files</span> · PNG, JPG, WEBP, GIF
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {rejected && <p className="mt-2 text-xs font-medium text-red-600">{rejected}</p>}

      {uploading.length > 0 && (
        <div className="mt-3 space-y-2">
          {uploading.map(([name, pct]) => (
            <div key={name}>
              <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                <span className="max-w-[70%] truncate">{name}</span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-teal-600 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
