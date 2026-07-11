"use client";

import type { KonvaEventObject } from "konva/lib/Node";
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
  onUpdatePoints: (id: number, points: Point[]) => void;
}

const PALETTE = ["#0d685e", "#0891b2", "#db2777", "#16a34a", "#ea580c", "#7c3aed"];
const CLOSE_THRESHOLD = 12; // px
const MAX_HEIGHT = 620;
const MIN_SCALE = 1;
const MAX_SCALE = 5;

const clamp = (value: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, value));

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
  onUpdatePoints,
}: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const htmlImage = useHtmlImage(resolveMediaUrl(image.file));

  const [drawMode, setDrawMode] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  // Zoom + pan of the stage.
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  // In-progress edit of a selected polygon's vertices (kept local until the
  // drag ends and the change is persisted).
  const [draft, setDraft] = useState<{ id: number; points: Point[] } | null>(null);

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

  // Reset drawing + view when switching images.
  useEffect(() => {
    setPoints([]);
    setDrawMode(false);
    setScale(1);
    setStagePos({ x: 0, y: 0 });
    setDraft(null);
  }, [image.id]);

  // Drop any pending vertex edit when the selection changes.
  useEffect(() => {
    setDraft(null);
  }, [selectedId]);

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

  // Effective points for a polygon — the live draft if it's the one being edited.
  const pointsFor = (polygon: Polygon): Point[] =>
    draft && draft.id === polygon.id ? draft.points : polygon.points;

  const firstDisplay = points.length > 0 ? toDisplay(points[0]) : null;
  const nearClose =
    !!firstDisplay &&
    !!cursor &&
    points.length >= 3 &&
    Math.hypot(cursor.x - firstDisplay[0], cursor.y - firstDisplay[1]) <= CLOSE_THRESHOLD / scale;

  // Keep the panned stage from drifting the image entirely off-screen.
  function boundPos(pos: { x: number; y: number }) {
    return {
      x: clamp(pos.x, width - width * scale, 0),
      y: clamp(pos.y, height - height * scale, 0),
    };
  }

  function applyZoom(nextScale: number, focus: { x: number; y: number }) {
    const clamped = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    // Keep the focus point steady while zooming.
    const worldX = (focus.x - stagePos.x) / scale;
    const worldY = (focus.y - stagePos.y) / scale;
    const nextPos =
      clamped === 1
        ? { x: 0, y: 0 }
        : boundPos({ x: focus.x - worldX * clamped, y: focus.y - worldY * clamped });
    setScale(clamped);
    setStagePos(nextPos);
  }

  function handleWheel(e: KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const factor = e.evt.deltaY > 0 ? 1 / 1.1 : 1.1;
    applyZoom(scale * factor, pointer);
  }

  function zoomFromButton(factor: number) {
    applyZoom(scale * factor, { x: width / 2, y: height / 2 });
  }

  function resetView() {
    setScale(1);
    setStagePos({ x: 0, y: 0 });
  }

  function handleStageClick() {
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
      if (cursor.x < 0 || cursor.y < 0 || cursor.x > width || cursor.y > height) return;
      setPoints((prev) => [...prev, [cursor.x / width, cursor.y / height]]);
    } else {
      onSelect(null);
    }
  }

  // Convert a dragged handle's local position into a normalized, in-bounds point.
  function handleVertexDrag(polygon: Polygon, index: number, node: { x: number; y: number }) {
    const nx = clamp(node.x / width, 0, 1);
    const ny = clamp(node.y / height, 0, 1);
    const base = pointsFor(polygon);
    const next = base.map((p, i) => (i === index ? ([nx, ny] as Point) : p));
    setDraft({ id: polygon.id, points: next });
  }

  const panEnabled = scale > 1 && !drawMode;
  const selectedPolygon = polygons.find((p) => p.id === selectedId) ?? null;
  const canEditVertices = selectedPolygon !== null && !drawMode && points.length === 0;

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
          {drawMode ? (
            <span className="text-xs text-gray-500">
              Click near the first point to close · Esc to cancel
            </span>
          ) : canEditVertices ? (
            <span className="text-xs text-gray-500">Drag the handles to reshape</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Zoom controls */}
          <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 bg-white">
            <button
              type="button"
              onClick={() => zoomFromButton(1 / 1.2)}
              disabled={scale <= MIN_SCALE}
              aria-label="Zoom out"
              className="px-2 py-1.5 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M5 12h14" />
              </svg>
            </button>
            <button
              type="button"
              onClick={resetView}
              aria-label="Reset zoom"
              className="min-w-[3rem] border-x border-gray-200 px-2 py-1.5 text-xs font-medium tabular-nums text-gray-600 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              type="button"
              onClick={() => zoomFromButton(1.2)}
              disabled={scale >= MAX_SCALE}
              aria-label="Zoom in"
              className="px-2 py-1.5 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
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
      </div>

      <div
        ref={containerRef}
        className="overflow-hidden rounded-2xl border border-gray-200 bg-slate-100"
        style={{ cursor: drawMode ? "crosshair" : panEnabled ? "grab" : "default" }}
      >
        {width > 0 && height > 0 && (
          <Stage
            width={width}
            height={height}
            scaleX={scale}
            scaleY={scale}
            x={stagePos.x}
            y={stagePos.y}
            draggable={panEnabled}
            dragBoundFunc={boundPos}
            onDragEnd={(e) => setStagePos(e.target.position())}
            onWheel={handleWheel}
            onMouseMove={(e) => {
              // Relative position undoes the stage's scale/pan, so all polygon
              // math stays in the image's own 0..1 space regardless of zoom.
              const pos = e.target.getStage()?.getRelativePointerPosition();
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
                    points={flatten(pointsFor(polygon))}
                    closed
                    fill={hexToRgba(polygon.color, selected ? 0.35 : 0.2)}
                    stroke={selected ? "#ffffff" : polygon.color}
                    strokeWidth={(selected ? 3 : 2) / scale}
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

              {/* Editable vertex handles for the selected polygon */}
              {canEditVertices &&
                selectedPolygon &&
                pointsFor(selectedPolygon).map((p, i) => {
                  const [x, y] = toDisplay(p);
                  return (
                    <Circle
                      key={`handle-${selectedPolygon.id}-${i}`}
                      x={x}
                      y={y}
                      radius={6 / scale}
                      fill="#ffffff"
                      stroke={selectedPolygon.color}
                      strokeWidth={2 / scale}
                      draggable
                      onMouseDown={(e) => {
                        e.cancelBubble = true;
                      }}
                      onDragStart={(e) => {
                        e.cancelBubble = true;
                      }}
                      onDragMove={(e) =>
                        handleVertexDrag(selectedPolygon, i, {
                          x: e.target.x(),
                          y: e.target.y(),
                        })
                      }
                      onDragEnd={() => {
                        const edited = draft;
                        setDraft(null);
                        if (edited && edited.id === selectedPolygon.id) {
                          onUpdatePoints(selectedPolygon.id, edited.points);
                        }
                      }}
                      onMouseEnter={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = "move";
                      }}
                      onMouseLeave={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = panEnabled ? "grab" : "default";
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
                    strokeWidth={2 / scale}
                    dash={[6 / scale, 4 / scale]}
                  />
                  {points.map((p, i) => {
                    const [x, y] = toDisplay(p);
                    const isFirst = i === 0;
                    return (
                      <Circle
                        key={i}
                        x={x}
                        y={y}
                        radius={(isFirst && nearClose ? 8 : 4) / scale}
                        fill={isFirst && nearClose ? "#16a34a" : "#ffffff"}
                        stroke="#0d685e"
                        strokeWidth={2 / scale}
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
