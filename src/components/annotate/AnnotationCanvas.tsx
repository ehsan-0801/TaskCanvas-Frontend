"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Circle, Image as KonvaImage, Layer, Line, Stage } from "react-konva";

import { resolveMediaUrl } from "@/lib/api";
import type { AnnotationImage, Point, Polygon } from "@/lib/types";

interface AnnotationCanvasProps {
  image: AnnotationImage;
  polygons: Polygon[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onCreate: (points: Point[], color: string) => void;
  onDeleteSelected: () => void;
}

const PALETTE = ["#0d685e", "#0891b2", "#db2777", "#16a34a", "#ea580c", "#7c3aed"];
const CLOSE_THRESHOLD = 12; // px
const MAX_HEIGHT = 620;

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Load an uploaded image into an HTMLImageElement for Konva.
function useHtmlImage(src: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    setImg(null);
    if (!src) return;
    const image = new window.Image();
    const onLoad = () => setImg(image);
    image.addEventListener("load", onLoad);
    image.src = src;
    return () => image.removeEventListener("load", onLoad);
  }, [src]);
  return img;
}

export function AnnotationCanvas({
  image,
  polygons,
  selectedId,
  onSelect,
  onCreate,
  onDeleteSelected,
}: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const htmlImage = useHtmlImage(resolveMediaUrl(image.file));

  const [drawMode, setDrawMode] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  // Measure available width so the stage fits the container responsively.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Reset the in-progress drawing when switching images.
  useEffect(() => {
    setPoints([]);
    setDrawMode(false);
  }, [image.id]);

  // Keyboard: Escape cancels drawing / deselects, Delete removes the selection.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (points.length > 0) setPoints([]);
        else onSelect(null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId !== null && points.length === 0) {
        e.preventDefault();
        onDeleteSelected();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [points.length, selectedId, onSelect, onDeleteSelected]);

  const aspect =
    image.width && image.height
      ? image.width / image.height
      : htmlImage
        ? htmlImage.width / htmlImage.height
        : 16 / 9;

  let width = containerWidth;
  let height = width / aspect;
  if (height > MAX_HEIGHT) {
    height = MAX_HEIGHT;
    width = height * aspect;
  }

  const toDisplay = (p: Point): [number, number] => [p[0] * width, p[1] * height];
  const flatten = (pts: Point[]) => pts.flatMap((p) => toDisplay(p));

  const firstDisplay = points.length > 0 ? toDisplay(points[0]) : null;
  const nearClose =
    !!firstDisplay &&
    !!cursor &&
    points.length >= 3 &&
    Math.hypot(cursor.x - firstDisplay[0], cursor.y - firstDisplay[1]) <= CLOSE_THRESHOLD;

  function handleStageClick() {
    const stageWidth = width;
    const stageHeight = height;
    if (!cursor) return;

    if (drawMode) {
      if (nearClose && firstDisplay) {
        if (points.length >= 3) {
          onCreate(points, PALETTE[polygons.length % PALETTE.length]);
          setPoints([]);
          setDrawMode(false);
        }
        return;
      }
      // Ignore clicks outside the image bounds.
      if (cursor.x < 0 || cursor.y < 0 || cursor.x > stageWidth || cursor.y > stageHeight) return;
      setPoints((prev) => [...prev, [cursor.x / stageWidth, cursor.y / stageHeight]]);
    } else {
      onSelect(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDrawMode((d) => !d);
              setPoints([]);
            }}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
              drawMode
                ? "bg-teal-600 text-white hover:bg-teal-700"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.586 7.586" />
              <circle cx="11" cy="11" r="2" />
            </svg>
            {drawMode ? "Drawing… (click to add points)" : "Draw polygon"}
          </button>
          {drawMode && (
            <span className="text-xs text-gray-500">
              Click near the first point to close · Esc to cancel
            </span>
          )}
        </div>
        {selectedId !== null && (
          <button
            type="button"
            onClick={onDeleteSelected}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
            Delete shape
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        className="overflow-hidden rounded-2xl border border-gray-200 bg-slate-100"
        style={{ cursor: drawMode ? "crosshair" : "default" }}
      >
        {width > 0 && height > 0 && (
          <Stage
            width={width}
            height={height}
            onMouseMove={(e) => {
              const pos = e.target.getStage()?.getPointerPosition();
              if (pos) setCursor(pos);
            }}
            onMouseLeave={() => setCursor(null)}
            onClick={handleStageClick}
            onTap={handleStageClick}
          >
            <Layer>
              {htmlImage && <KonvaImage image={htmlImage} width={width} height={height} name="bg" />}

              {/* Saved polygons */}
              {polygons.map((polygon) => {
                const selected = polygon.id === selectedId;
                return (
                  <Line
                    key={polygon.id}
                    points={flatten(polygon.points)}
                    closed
                    fill={hexToRgba(polygon.color, selected ? 0.35 : 0.2)}
                    stroke={selected ? "#ffffff" : polygon.color}
                    strokeWidth={selected ? 3 : 2}
                    shadowColor={selected ? polygon.color : undefined}
                    shadowBlur={selected ? 6 : 0}
                    onClick={(e) => {
                      if (drawMode) return;
                      e.cancelBubble = true;
                      onSelect(polygon.id);
                    }}
                    onTap={(e) => {
                      if (drawMode) return;
                      e.cancelBubble = true;
                      onSelect(polygon.id);
                    }}
                  />
                );
              })}

              {/* In-progress polygon */}
              {points.length > 0 && (
                <>
                  <Line
                    points={[
                      ...flatten(points),
                      ...(cursor ? [cursor.x, cursor.y] : []),
                    ]}
                    stroke="#0d685e"
                    strokeWidth={2}
                    dash={[6, 4]}
                  />
                  {points.map((p, i) => {
                    const [x, y] = toDisplay(p);
                    const isFirst = i === 0;
                    return (
                      <Circle
                        key={i}
                        x={x}
                        y={y}
                        radius={isFirst && nearClose ? 8 : 4}
                        fill={isFirst && nearClose ? "#16a34a" : "#ffffff"}
                        stroke="#0d685e"
                        strokeWidth={2}
                      />
                    );
                  })}
                </>
              )}
            </Layer>
          </Stage>
        )}
      </div>
    </div>
  );
}
