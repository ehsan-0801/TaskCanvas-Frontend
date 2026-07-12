"use client";

import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Circle, Image as KonvaImage, Label, Layer, Line, Rect, Stage, Tag, Text } from "react-konva";

import { resolveMediaUrl } from "@/lib/api";
import type { AnnotationImage, Point, Polygon } from "@/lib/types";
import { POLYGON_COLORS } from "./palette";

type PolygonPatch = Partial<Pick<Polygon, "label" | "color" | "points" | "label_x" | "label_y">>;
type Tool = "select" | "polygon" | "rectangle" | "square" | "triangle" | "circle";

/** A live edit of one shape. labelX/labelY are only set when the shape has a
 *  hand-placed label that needs to move along with it. */
interface Draft {
  id: number;
  points: Point[];
  labelX?: number | null;
  labelY?: number | null;
}

interface AnnotationCanvasProps {
  image: AnnotationImage;
  images: AnnotationImage[];
  polygons: Polygon[];
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  onCreate: (points: Point[], color: string) => void;
  onUpdate: (id: number, patch: PolygonPatch) => void;
  onDelete: (ids: number[]) => void;
  onDuplicate: (ids: number[]) => void;
  onCopyToImage: (ids: number[], targetImageId: number) => void;
  onPrevImage: () => void;
  onNextImage: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const CLOSE_THRESHOLD = 12;
const MAX_HEIGHT = 620;
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const NUDGE_PX = 1;
const NUDGE_PX_FAST = 10;
const CIRCLE_SEGMENTS = 44;
const MIN_DRAW_PX = 6;
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type Handle = (typeof HANDLES)[number];

const BOX_TOOLS: Tool[] = ["rectangle", "square", "triangle", "circle"];
const isBoxTool = (t: Tool) => BOX_TOOLS.includes(t);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function centroid(points: Point[]): Point {
  const sum = points.reduce<[number, number]>((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function bboxOf(points: Point[]): BBox {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function handleAt(bb: BBox, h: Handle): Point {
  const mx = (bb.x0 + bb.x1) / 2;
  const my = (bb.y0 + bb.y1) / 2;
  switch (h) {
    case "nw": return [bb.x0, bb.y0];
    case "n": return [mx, bb.y0];
    case "ne": return [bb.x1, bb.y0];
    case "e": return [bb.x1, my];
    case "se": return [bb.x1, bb.y1];
    case "s": return [mx, bb.y1];
    case "sw": return [bb.x0, bb.y1];
    case "w": return [bb.x0, my];
  }
}

/** Scale a shape's points as one of its bounding-box handles is dragged. */
function resizePoints(h: Handle, startPts: Point[], bb: BBox, p: Point): Point[] {
  const EPS = 0.004;
  let { x0, y0, x1, y1 } = bb;
  if (h.includes("w")) x0 = Math.min(p[0], bb.x1 - EPS);
  if (h.includes("e")) x1 = Math.max(p[0], bb.x0 + EPS);
  if (h.includes("n")) y0 = Math.min(p[1], bb.y1 - EPS);
  if (h.includes("s")) y1 = Math.max(p[1], bb.y0 + EPS);

  const sx = (x1 - x0) / Math.max(bb.x1 - bb.x0, EPS);
  const sy = (y1 - y0) / Math.max(bb.y1 - bb.y0, EPS);
  // The side that didn't move stays pinned.
  const ax = h.includes("w") ? bb.x1 : bb.x0;
  const ay = h.includes("n") ? bb.y1 : bb.y0;
  const nax = h.includes("w") ? x1 : x0;
  const nay = h.includes("n") ? y1 : y0;

  return startPts.map(([x, y]) => [
    clamp(nax + (x - ax) * sx, 0, 1),
    clamp(nay + (y - ay) * sy, 0, 1),
  ] as Point);
}

function projectOnSegment(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { point: a, dist: Math.hypot(p[0] - a[0], p[1] - a[1]) };
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2, 0, 1);
  const q: Point = [a[0] + t * dx, a[1] + t * dy];
  return { point: q, dist: Math.hypot(p[0] - q[0], p[1] - q[1]) };
}

function nearestEdge(points: Point[], p: Point) {
  let best = { index: 0, point: points[0], dist: Infinity };
  for (let i = 0; i < points.length; i += 1) {
    const { point, dist } = projectOnSegment(p, points[i], points[(i + 1) % points.length]);
    if (dist < best.dist) best = { index: i, point, dist };
  }
  return best;
}

function useHtmlImage(src: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    setImg(null);
    if (!src) return;
    const image = new window.Image();
    image.crossOrigin = "anonymous"; // so Konva can cache and filter it
    const onLoad = () => setImg(image);
    image.addEventListener("load", onLoad);
    image.src = src;
    return () => image.removeEventListener("load", onLoad);
  }, [src]);
  return img;
}

type MenuState =
  | { kind: "shape"; x: number; y: number; polygonId: number; at: Point }
  | { kind: "vertex"; x: number; y: number; polygonId: number; index: number }
  | { kind: "canvas"; x: number; y: number }
  | null;

export function AnnotationCanvas({
  image,
  images,
  polygons,
  selectedIds,
  onSelectionChange,
  onCreate,
  onUpdate,
  onDelete,
  onDuplicate,
  onCopyToImage,
  onPrevImage,
  onNextImage,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<Konva.Image>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const htmlImage = useHtmlImage(resolveMediaUrl(image.file));

  const [tool, setTool] = useState<Tool>("select");
  const [drawColor, setDrawColor] = useState(POLYGON_COLORS[0]);
  const [points, setPoints] = useState<Point[]>([]); // in-progress polygon
  const [box, setBox] = useState<{ start: Point; end: Point } | null>(null); // in-progress shape
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [activeVertex, setActiveVertex] = useState<{ id: number; index: number } | null>(null);
  const [editPoints, setEditPoints] = useState(false);
  const [moving, setMoving] = useState(false);
  const resizeStart = useRef<{ points: Point[]; bbox: BBox; labelX: number | null; labelY: number | null } | null>(null);

  const [showShapes, setShowShapes] = useState(true);
  const [fillOpacity, setFillOpacity] = useState(0.25);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);

  const [menu, setMenu] = useState<MenuState>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [labelEditor, setLabelEditor] = useState<{ id: number; x: number; y: number; value: string } | null>(null);

  const nudgeTimer = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setTool("select");
    setPoints([]);
    setBox(null);
    setScale(1);
    setStagePos({ x: 0, y: 0 });
    setDraft(null);
    setActiveVertex(null);
    setEditPoints(false);
    setMenu(null);
    setLabelEditor(null);
    setBrightness(0);
    setContrast(0);
  }, [image.id]);

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

  useEffect(() => {
    const node = imageRef.current;
    if (!node || !htmlImage || width <= 0 || height <= 0) return;
    node.cache();
    node.getLayer()?.batchDraw();
  }, [htmlImage, width, height, brightness, contrast]);

  const toDisplay = useCallback(
    (p: Point): [number, number] => [p[0] * width, p[1] * height],
    [width, height]
  );
  const flatten = (pts: Point[]) => pts.flatMap((p) => toDisplay(p));

  const pointsFor = useCallback(
    (polygon: Polygon): Point[] => (draft && draft.id === polygon.id ? draft.points : polygon.points),
    [draft]
  );

  /** Where a shape's label chip sits: its hand-placed spot, or the centre. */
  const labelPointOf = useCallback(
    (polygon: Polygon): Point => {
      const d = draft && draft.id === polygon.id ? draft : null;
      const lx = d && d.labelX !== undefined ? d.labelX : polygon.label_x;
      const ly = d && d.labelY !== undefined ? d.labelY : polygon.label_y;
      if (lx != null && ly != null) return [lx, ly];
      return centroid(pointsFor(polygon));
    },
    [draft, pointsFor]
  );

  const singleSelected = useMemo(
    () => (selectedIds.length === 1 ? polygons.find((p) => p.id === selectedIds[0]) ?? null : null),
    [selectedIds, polygons]
  );

  const firstDisplay = points.length > 0 ? toDisplay(points[0]) : null;
  const nearClose =
    !!firstDisplay &&
    !!cursor &&
    points.length >= 3 &&
    Math.hypot(cursor.x - firstDisplay[0], cursor.y - firstDisplay[1]) <= CLOSE_THRESHOLD / scale;

  /* --------------------------- shape generation -------------------------- */

  const shapeFromBox = useCallback(
    (kind: Tool, a: Point, b: Point): Point[] | null => {
      const ax = a[0] * width;
      const ay = a[1] * height;
      const bx = b[0] * width;
      const by = b[1] * height;
      let x0 = Math.min(ax, bx);
      let y0 = Math.min(ay, by);
      let x1 = Math.max(ax, bx);
      let y1 = Math.max(ay, by);

      if (x1 - x0 < MIN_DRAW_PX || y1 - y0 < MIN_DRAW_PX) return null;

      // A square and a circle need equal sides in screen pixels, grown in the
      // direction the pointer was dragged.
      if (kind === "square" || kind === "circle") {
        const side = Math.min(x1 - x0, y1 - y0);
        if (bx < ax) x0 = x1 - side;
        else x1 = x0 + side;
        if (by < ay) y0 = y1 - side;
        else y1 = y0 + side;
      }

      const n = (x: number, y: number): Point => [clamp(x / width, 0, 1), clamp(y / height, 0, 1)];

      switch (kind) {
        case "rectangle":
        case "square":
          return [n(x0, y0), n(x1, y0), n(x1, y1), n(x0, y1)];
        case "triangle":
          return [n((x0 + x1) / 2, y0), n(x1, y1), n(x0, y1)];
        case "circle": {
          const cx = (x0 + x1) / 2;
          const cy = (y0 + y1) / 2;
          const r = (x1 - x0) / 2;
          return Array.from({ length: CIRCLE_SEGMENTS }, (_, i) => {
            const t = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
            return n(cx + r * Math.cos(t), cy + r * Math.sin(t));
          });
        }
        default:
          return null;
      }
    },
    [width, height]
  );

  /* ------------------------------ editing -------------------------------- */

  const persistShape = useCallback(
    (id: number, patch: PolygonPatch) => {
      setDraft(null);
      onUpdate(id, patch);
    },
    [onUpdate]
  );

  const persistPoints = useCallback(
    (id: number, next: Point[]) => persistShape(id, { points: next }),
    [persistShape]
  );

  /** Translate a hand-placed label by the same delta as its shape. */
  const shiftedLabel = useCallback((polygon: Polygon, dx: number, dy: number): PolygonPatch => {
    if (polygon.label_x == null || polygon.label_y == null) return {};
    return {
      label_x: clamp(polygon.label_x + dx, 0, 1),
      label_y: clamp(polygon.label_y + dy, 0, 1),
    };
  }, []);

  const insertVertex = useCallback(
    (polygon: Polygon, edgeIndex: number, at: Point) => {
      const base = pointsFor(polygon);
      persistPoints(polygon.id, [...base.slice(0, edgeIndex + 1), at, ...base.slice(edgeIndex + 1)]);
    },
    [pointsFor, persistPoints]
  );

  const removeVertex = useCallback(
    (polygon: Polygon, index: number) => {
      const base = pointsFor(polygon);
      if (base.length <= 3) return;
      persistPoints(polygon.id, base.filter((_, i) => i !== index));
      setActiveVertex(null);
    },
    [pointsFor, persistPoints]
  );

  const scheduleNudgeSave = useCallback(
    (id: number, next: Point[], labelPatch: PolygonPatch) => {
      setDraft({ id, points: next, ...("label_x" in labelPatch ? { labelX: labelPatch.label_x, labelY: labelPatch.label_y } : {}) });
      if (nudgeTimer.current) window.clearTimeout(nudgeTimer.current);
      nudgeTimer.current = window.setTimeout(() => {
        setDraft(null);
        onUpdate(id, { points: next, ...labelPatch });
      }, 450);
    },
    [onUpdate]
  );

  const nudge = useCallback(
    (dx: number, dy: number) => {
      const polygon = singleSelected;
      if (!polygon || width === 0 || height === 0) return;
      const nx = dx / width;
      const ny = dy / height;
      const base = pointsFor(polygon);
      // A single selected vertex moves alone; otherwise the whole shape moves.
      const movingWholeShape = !(activeVertex && activeVertex.id === polygon.id);
      const next: Point[] = base.map((p, i) =>
        !movingWholeShape && activeVertex!.index !== i
          ? p
          : [clamp(p[0] + nx, 0, 1), clamp(p[1] + ny, 0, 1)]
      );
      scheduleNudgeSave(
        polygon.id,
        next,
        movingWholeShape ? shiftedLabel(polygon, nx, ny) : {}
      );
    },
    [singleSelected, activeVertex, pointsFor, width, height, scheduleNudgeSave, shiftedLabel]
  );

  const openLabelEditor = useCallback(
    (polygon: Polygon) => {
      const [cx, cy] = toDisplay(labelPointOf(polygon));
      setLabelEditor({
        id: polygon.id,
        x: stagePos.x + cx * scale,
        y: stagePos.y + cy * scale,
        value: polygon.label,
      });
      setMenu(null);
    },
    [labelPointOf, toDisplay, stagePos, scale]
  );

  function commitLabel() {
    if (!labelEditor) return;
    const polygon = polygons.find((p) => p.id === labelEditor.id);
    const next = labelEditor.value.trim();
    if (polygon && next !== polygon.label) onUpdate(labelEditor.id, { label: next });
    setLabelEditor(null);
  }

  const setColorOnSelection = useCallback(
    (color: string, fallbackId?: number) => {
      const ids = selectedIds.length ? selectedIds : fallbackId ? [fallbackId] : [];
      ids.forEach((id) => onUpdate(id, { color }));
    },
    [selectedIds, onUpdate]
  );

  /* ------------------------------ keyboard ------------------------------- */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const meta = e.metaKey || e.ctrlKey;

      if (e.key === "Escape") {
        if (labelEditor) setLabelEditor(null);
        else if (menu) setMenu(null);
        else if (points.length > 0) setPoints([]);
        else if (box) setBox(null);
        else if (tool !== "select") setTool("select");
        else onSelectionChange([]);
        return;
      }
      // Undo / redo. Ctrl+Y and Ctrl+Shift+Z both redo.
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        onRedo();
        return;
      }
      if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        onSelectionChange(polygons.map((p) => p.id));
        return;
      }
      if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (selectedIds.length) onDuplicate(selectedIds);
        return;
      }

      const keyTool: Record<string, Tool> = {
        v: "select", d: "polygon", p: "polygon",
        r: "rectangle", s: "square", t: "triangle", c: "circle",
      };
      // Plain letters only — never hijack Ctrl/Cmd combos like Ctrl+S.
      if (!meta && keyTool[e.key]) {
        setTool(keyTool[e.key]);
        setPoints([]);
        setBox(null);
        return;
      }
      if (!meta && e.key === "e" && singleSelected) {
        setEditPoints((v) => !v);
        return;
      }
      if (!meta && e.key === "h") {
        setShowShapes((v) => !v);
        return;
      }
      if (!meta && e.key === "[") return onPrevImage();
      if (!meta && e.key === "]") return onNextImage();

      if ((e.key === "Enter" || e.key === "F2") && singleSelected) {
        e.preventDefault();
        openLabelEditor(singleSelected);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && points.length === 0) {
        if (editPoints && activeVertex && singleSelected) {
          e.preventDefault();
          removeVertex(singleSelected, activeVertex.index);
        } else if (selectedIds.length) {
          e.preventDefault();
          onDelete(selectedIds);
        }
        return;
      }
      if (!meta && /^[1-6]$/.test(e.key) && selectedIds.length) {
        setColorOnSelection(POLYGON_COLORS[Number(e.key) - 1]);
        return;
      }

      const step = e.shiftKey ? NUDGE_PX_FAST : NUDGE_PX;
      if (e.key === "ArrowLeft") { e.preventDefault(); nudge(-step, 0); }
      else if (e.key === "ArrowRight") { e.preventDefault(); nudge(step, 0); }
      else if (e.key === "ArrowUp") { e.preventDefault(); nudge(0, -step); }
      else if (e.key === "ArrowDown") { e.preventDefault(); nudge(0, step); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    labelEditor, menu, points.length, box, tool, polygons, selectedIds, singleSelected,
    activeVertex, editPoints, onSelectionChange, onDuplicate, onDelete, onPrevImage,
    onNextImage, onUndo, onRedo, openLabelEditor, removeVertex, nudge, setColorOnSelection,
  ]);

  /* -------------------------------- view --------------------------------- */

  function boundPos(pos: { x: number; y: number }) {
    return {
      x: clamp(pos.x, width - width * scale, 0),
      y: clamp(pos.y, height - height * scale, 0),
    };
  }

  function applyZoom(next: number, focus: { x: number; y: number }) {
    const clamped = clamp(next, MIN_SCALE, MAX_SCALE);
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
    const pointer = e.target.getStage()?.getPointerPosition();
    if (!pointer) return;
    applyZoom(scale * (e.evt.deltaY > 0 ? 1 / 1.1 : 1.1), pointer);
  }

  /* ----------------------------- interaction ----------------------------- */

  function handleMouseDown(e: KonvaEventObject<MouseEvent>) {
    if (!isBoxTool(tool)) return;
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (!pos) return;
    const p: Point = [pos.x / width, pos.y / height];
    setBox({ start: p, end: p });
  }

  function handleMouseUp() {
    if (!box || !isBoxTool(tool)) return;
    const pts = shapeFromBox(tool, box.start, box.end);
    setBox(null);
    if (pts) {
      onCreate(pts, drawColor);
      setTool("select");
    }
  }

  function handleStageClick(e: KonvaEventObject<MouseEvent | TouchEvent>) {
    setMenu(null);
    if (!cursor) return;

    if (tool === "polygon") {
      if (nearClose && points.length >= 3) {
        onCreate(points, drawColor);
        setPoints([]);
        setTool("select");
        return;
      }
      if (cursor.x < 0 || cursor.y < 0 || cursor.x > width || cursor.y > height) return;
      setPoints((prev) => [...prev, [cursor.x / width, cursor.y / height]]);
      return;
    }

    if (tool === "select" && (e.target === e.target.getStage() || e.target.name() === "bg")) {
      onSelectionChange([]);
      setActiveVertex(null);
      setEditPoints(false);
    }
  }

  function selectPolygon(id: number, additive: boolean) {
    setActiveVertex(null);
    if (!additive) {
      if (!selectedIds.includes(id)) setEditPoints(false);
      onSelectionChange([id]);
      return;
    }
    onSelectionChange(
      selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id]
    );
  }

  function handleContextMenu(e: KonvaEventObject<PointerEvent>) {
    e.evt.preventDefault();
    setCopyOpen(false);
    const rect = containerRef.current?.getBoundingClientRect();
    const x = e.evt.clientX - (rect?.left ?? 0);
    const y = e.evt.clientY - (rect?.top ?? 0);
    const local = e.target.getStage()?.getRelativePointerPosition();
    const name = e.target.name();

    if (name.startsWith("vertex-") && local) {
      const parts = name.split("-");
      setMenu({ kind: "vertex", x, y, polygonId: Number(parts[1]), index: Number(parts[2]) });
      return;
    }
    if (name.startsWith("poly-") && local) {
      const id = Number(name.split("-")[1]);
      if (!selectedIds.includes(id)) onSelectionChange([id]);
      setMenu({ kind: "shape", x, y, polygonId: id, at: [local.x / width, local.y / height] });
      return;
    }
    setMenu({ kind: "canvas", x, y });
  }

  const drawing = tool !== "select";
  const panEnabled = scale > 1 && !drawing;
  const otherImages = images.filter((img) => img.id !== image.id);
  const menuPolygon = menu && menu.kind !== "canvas" ? polygons.find((p) => p.id === menu.polygonId) : null;
  const selectedBox = singleSelected && !drawing && !moving ? bboxOf(pointsFor(singleSelected)) : null;
  const previewPoints = box ? shapeFromBox(tool, box.start, box.end) : null;

  const TOOLS: { id: Tool; label: string; hint: string; icon: React.ReactNode }[] = [
    { id: "select", label: "Select", hint: "V", icon: <path d="m3 3 7.5 18 2.2-7.3L20 11.5 3 3Z" /> },
    { id: "polygon", label: "Polygon", hint: "D", icon: <path d="M12 3 21 9v7l-9 5-9-5V9l9-6Z" /> },
    { id: "rectangle", label: "Rectangle", hint: "R", icon: <rect x="3" y="6" width="18" height="12" rx="1" /> },
    { id: "square", label: "Square", hint: "S", icon: <rect x="5" y="5" width="14" height="14" rx="1" /> },
    { id: "triangle", label: "Triangle", hint: "T", icon: <path d="M12 4 21 19H3L12 4Z" /> },
    { id: "circle", label: "Circle", hint: "C", icon: <circle cx="12" cy="12" r="8" /> },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-gray-300 bg-white p-0.5">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTool(t.id);
                setPoints([]);
                setBox(null);
              }}
              title={`${t.label} (${t.hint})`}
              aria-label={t.label}
              aria-pressed={tool === t.id}
              className={`rounded-md p-1.5 transition ${
                tool === t.id ? "bg-teal-600 text-white" : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {t.icon}
              </svg>
            </button>
          ))}
        </div>

        <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 bg-white">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className="px-2 py-1.5 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.36 2.64L3 13" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            className="border-l border-gray-200 px-2 py-1.5 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 7v6h-6" />
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.36 2.64L21 13" />
            </svg>
          </button>
        </div>

        <label className="flex items-center gap-1.5 text-xs text-gray-500" title="Colour for new shapes">
          New
          <input
            type="color"
            value={drawColor}
            onChange={(e) => setDrawColor(e.target.value)}
            className="h-6 w-8 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
          />
        </label>

        {singleSelected && (
          <>
            <button
              type="button"
              onClick={() => setEditPoints((v) => !v)}
              aria-pressed={editPoints}
              title="Edit points (E)"
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                editPoints
                  ? "border-teal-600 bg-teal-600 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Edit points
            </button>
            <label className="flex items-center gap-1.5 text-xs text-gray-500" title="Colour of the selected shape">
              Shape
              <input
                type="color"
                value={singleSelected.color}
                onChange={(e) => setColorOnSelection(e.target.value)}
                className="h-6 w-8 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
              />
            </label>
          </>
        )}

        <button
          type="button"
          onClick={() => setShowShapes((v) => !v)}
          title="Show/hide shapes (H)"
          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
        >
          {showShapes ? "Hide" : "Show"}
        </button>

        <label className="flex items-center gap-1 text-xs text-gray-500" title="Fill opacity">
          Fill
          <input type="range" min={0} max={0.8} step={0.05} value={fillOpacity}
            onChange={(e) => setFillOpacity(Number(e.target.value))} className="h-1 w-16 accent-teal-600" />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-500" title="Image brightness">
          Bright
          <input type="range" min={-0.6} max={0.6} step={0.05} value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))} className="h-1 w-16 accent-teal-600" />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-500" title="Image contrast">
          Contrast
          <input type="range" min={-60} max={60} step={5} value={contrast}
            onChange={(e) => setContrast(Number(e.target.value))} className="h-1 w-16 accent-teal-600" />
        </label>

        <div className="ml-auto flex items-center overflow-hidden rounded-lg border border-gray-300 bg-white">
          <button type="button" onClick={() => applyZoom(scale / 1.2, { x: width / 2, y: height / 2 })}
            disabled={scale <= MIN_SCALE} aria-label="Zoom out"
            className="px-2 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /></svg>
          </button>
          <button type="button" onClick={() => { setScale(1); setStagePos({ x: 0, y: 0 }); }}
            className="min-w-[3rem] border-x border-gray-200 px-2 py-1.5 text-xs font-medium tabular-nums text-gray-600 hover:bg-gray-50">
            {Math.round(scale * 100)}%
          </button>
          <button type="button" onClick={() => applyZoom(scale * 1.2, { x: width / 2, y: height / 2 })}
            disabled={scale >= MAX_SCALE} aria-label="Zoom in"
            className="px-2 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>
      </div>

      {selectedIds.length > 1 && (
        <div className="flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-1.5 text-xs text-teal-800">
          <span className="font-medium">{selectedIds.length} shapes selected</span>
          <button type="button" onClick={() => onDuplicate(selectedIds)} className="underline underline-offset-2">Duplicate</button>
          <button type="button" onClick={() => onDelete(selectedIds)} className="underline underline-offset-2">Delete</button>
          <input
            type="color"
            aria-label="Colour for all selected shapes"
            onChange={(e) => setColorOnSelection(e.target.value)}
            className="h-5 w-6 cursor-pointer rounded border border-teal-300 bg-white p-0.5"
          />
          <span className="ml-auto text-teal-600">Right-click for more</span>
        </div>
      )}

      {/* stage */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-2xl border border-gray-200 bg-slate-100"
        style={{ cursor: drawing ? "crosshair" : panEnabled ? "grab" : "default" }}
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
            onDragEnd={(e) => {
              if (e.target === e.target.getStage()) setStagePos(e.target.position());
            }}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseMove={(e) => {
              const pos = e.target.getStage()?.getRelativePointerPosition();
              if (!pos) return;
              setCursor(pos);
              if (box) setBox((b) => (b ? { ...b, end: [pos.x / width, pos.y / height] } : b));
            }}
            onMouseLeave={() => setCursor(null)}
            onClick={handleStageClick}
            onTap={handleStageClick}
          >
            <Layer>
              {htmlImage && (
                <KonvaImage
                  ref={imageRef}
                  image={htmlImage}
                  width={width}
                  height={height}
                  name="bg"
                  filters={[Konva.Filters.Brighten, Konva.Filters.Contrast]}
                  brightness={brightness}
                  contrast={contrast}
                />
              )}

              {showShapes &&
                polygons.map((polygon) => {
                  const selected = selectedIds.includes(polygon.id);
                  return (
                    <Line
                      key={polygon.id}
                      name={`poly-${polygon.id}`}
                      points={flatten(pointsFor(polygon))}
                      closed
                      fill={hexToRgba(polygon.color, selected ? fillOpacity + 0.15 : fillOpacity)}
                      stroke={selected ? "#ffffff" : polygon.color}
                      strokeWidth={(selected ? 3 : 2) / scale}
                      shadowColor={selected ? polygon.color : undefined}
                      shadowBlur={selected ? 6 : 0}
                      draggable={selected && tool === "select"}
                      onDragStart={(e) => {
                        e.cancelBubble = true;
                        setMoving(true);
                      }}
                      onDragEnd={(e) => {
                        e.cancelBubble = true;
                        setMoving(false);
                        const node = e.target;
                        const dx = node.x() / width;
                        const dy = node.y() / height;
                        node.position({ x: 0, y: 0 });
                        if (dx === 0 && dy === 0) return;
                        persistShape(polygon.id, {
                          points: pointsFor(polygon).map(
                            ([x, y]) => [clamp(x + dx, 0, 1), clamp(y + dy, 0, 1)] as Point
                          ),
                          ...shiftedLabel(polygon, dx, dy),
                        });
                      }}
                      onClick={(e) => {
                        if (drawing) return;
                        e.cancelBubble = true;
                        selectPolygon(polygon.id, e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey);
                      }}
                      onTap={(e) => {
                        if (drawing) return;
                        e.cancelBubble = true;
                        selectPolygon(polygon.id, false);
                      }}
                      onDblClick={(e) => {
                        e.cancelBubble = true;
                        openLabelEditor(polygon);
                      }}
                    />
                  );
                })}

              {/* Label chips — drag one to place it wherever you like */}
              {showShapes &&
                polygons.map((polygon, i) => {
                  const [lx, ly] = toDisplay(labelPointOf(polygon));
                  const placed = polygon.label_x != null && polygon.label_y != null;
                  return (
                    <Label
                      key={`label-${polygon.id}`}
                      x={lx}
                      y={ly}
                      scaleX={1 / scale}
                      scaleY={1 / scale}
                      draggable={!drawing}
                      onDragStart={(e) => {
                        e.cancelBubble = true;
                      }}
                      onDragEnd={(e) => {
                        e.cancelBubble = true;
                        const node = e.target;
                        onUpdate(polygon.id, {
                          label_x: clamp(node.x() / width, 0, 1),
                          label_y: clamp(node.y() / height, 0, 1),
                        });
                      }}
                      onClick={(e) => {
                        if (drawing) return;
                        e.cancelBubble = true;
                        selectPolygon(polygon.id, e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey);
                      }}
                      onDblClick={(e) => {
                        e.cancelBubble = true;
                        openLabelEditor(polygon);
                      }}
                      onMouseEnter={(e) => {
                        const s = e.target.getStage();
                        if (s && !drawing) s.container().style.cursor = "move";
                      }}
                      onMouseLeave={(e) => {
                        const s = e.target.getStage();
                        if (s) s.container().style.cursor = drawing ? "crosshair" : "default";
                      }}
                    >
                      <Tag
                        fill={polygon.color}
                        cornerRadius={3}
                        opacity={0.9}
                        stroke={placed ? "#ffffff" : undefined}
                        strokeWidth={placed ? 1 : 0}
                      />
                      <Text text={polygon.label || `Shape ${i + 1}`} fontSize={12} padding={4} fill="#ffffff" />
                    </Label>
                  );
                })}

              {/* Bounding box + resize handles for the selected shape */}
              {selectedBox && singleSelected && showShapes && !editPoints && (
                <>
                  <Rect
                    x={selectedBox.x0 * width}
                    y={selectedBox.y0 * height}
                    width={(selectedBox.x1 - selectedBox.x0) * width}
                    height={(selectedBox.y1 - selectedBox.y0) * height}
                    stroke="#0d685e"
                    strokeWidth={1 / scale}
                    dash={[4 / scale, 3 / scale]}
                    listening={false}
                  />
                  {HANDLES.map((h) => {
                    const [hx, hy] = toDisplay(handleAt(selectedBox, h));
                    const size = 8 / scale;
                    return (
                      <Rect
                        key={h}
                        x={hx - size / 2}
                        y={hy - size / 2}
                        width={size}
                        height={size}
                        fill="#ffffff"
                        stroke="#0d685e"
                        strokeWidth={1.5 / scale}
                        draggable
                        onDragStart={(e) => {
                          e.cancelBubble = true;
                          resizeStart.current = {
                            points: pointsFor(singleSelected),
                            bbox: bboxOf(pointsFor(singleSelected)),
                            labelX: singleSelected.label_x,
                            labelY: singleSelected.label_y,
                          };
                        }}
                        onDragMove={(e) => {
                          const start = resizeStart.current;
                          if (!start) return;
                          const p: Point = [
                            clamp((e.target.x() + size / 2) / width, 0, 1),
                            clamp((e.target.y() + size / 2) / height, 0, 1),
                          ];
                          const nextPoints = resizePoints(h, start.points, start.bbox, p);
                          // A hand-placed label scales with the shape.
                          const hasLabelPos = start.labelX != null && start.labelY != null;
                          const nextLabel = hasLabelPos
                            ? resizePoints(h, [[start.labelX!, start.labelY!]], start.bbox, p)[0]
                            : null;
                          setDraft({
                            id: singleSelected.id,
                            points: nextPoints,
                            ...(nextLabel ? { labelX: nextLabel[0], labelY: nextLabel[1] } : {}),
                          });
                        }}
                        onDragEnd={(e) => {
                          e.cancelBubble = true;
                          resizeStart.current = null;
                          if (draft && draft.id === singleSelected.id) {
                            persistShape(singleSelected.id, {
                              points: draft.points,
                              ...(draft.labelX != null && draft.labelY != null
                                ? { label_x: draft.labelX, label_y: draft.labelY }
                                : {}),
                            });
                          }
                        }}
                        onMouseEnter={(e) => {
                          const stage = e.target.getStage();
                          if (stage) stage.container().style.cursor = "nwse-resize";
                        }}
                        onMouseLeave={(e) => {
                          const stage = e.target.getStage();
                          if (stage) stage.container().style.cursor = "default";
                        }}
                      />
                    );
                  })}
                </>
              )}

              {/* Vertex + midpoint handles, when editing points */}
              {editPoints && singleSelected && showShapes && !drawing && (() => {
                const pts = pointsFor(singleSelected);
                return (
                  <>
                    {pts.map((p, i) => {
                      const next = pts[(i + 1) % pts.length];
                      const mid: Point = [(p[0] + next[0]) / 2, (p[1] + next[1]) / 2];
                      const [mx, my] = toDisplay(mid);
                      return (
                        <Circle
                          key={`mid-${i}`}
                          x={mx}
                          y={my}
                          radius={4 / scale}
                          fill="#ffffff"
                          opacity={0.55}
                          stroke={singleSelected.color}
                          strokeWidth={1 / scale}
                          onClick={(e) => {
                            e.cancelBubble = true;
                            insertVertex(singleSelected, i, mid);
                          }}
                          onMouseEnter={(e) => {
                            const s = e.target.getStage();
                            if (s) s.container().style.cursor = "copy";
                          }}
                          onMouseLeave={(e) => {
                            const s = e.target.getStage();
                            if (s) s.container().style.cursor = "default";
                          }}
                        />
                      );
                    })}
                    {pts.map((p, i) => {
                      const [x, y] = toDisplay(p);
                      const isActive = activeVertex?.id === singleSelected.id && activeVertex.index === i;
                      return (
                        <Circle
                          key={`vertex-${i}`}
                          name={`vertex-${singleSelected.id}-${i}`}
                          x={x}
                          y={y}
                          radius={(isActive ? 7 : 6) / scale}
                          fill={isActive ? singleSelected.color : "#ffffff"}
                          stroke={isActive ? "#ffffff" : singleSelected.color}
                          strokeWidth={2 / scale}
                          draggable
                          onMouseDown={(e) => {
                            e.cancelBubble = true;
                            setActiveVertex({ id: singleSelected.id, index: i });
                          }}
                          onDragStart={(e) => { e.cancelBubble = true; }}
                          onDragMove={(e) => {
                            const nx = clamp(e.target.x() / width, 0, 1);
                            const ny = clamp(e.target.y() / height, 0, 1);
                            setDraft({
                              id: singleSelected.id,
                              points: pointsFor(singleSelected).map((q, qi) => (qi === i ? [nx, ny] : q)),
                            });
                          }}
                          onDragEnd={() => {
                            if (draft && draft.id === singleSelected.id) {
                              persistPoints(singleSelected.id, draft.points);
                            }
                          }}
                          onMouseEnter={(e) => {
                            const s = e.target.getStage();
                            if (s) s.container().style.cursor = "move";
                          }}
                          onMouseLeave={(e) => {
                            const s = e.target.getStage();
                            if (s) s.container().style.cursor = "default";
                          }}
                        />
                      );
                    })}
                  </>
                );
              })()}

              {/* Preview while dragging out a rectangle/square/triangle/circle */}
              {previewPoints && (
                <Line
                  points={flatten(previewPoints)}
                  closed
                  fill={hexToRgba(drawColor, 0.2)}
                  stroke={drawColor}
                  strokeWidth={2 / scale}
                  dash={[6 / scale, 4 / scale]}
                  listening={false}
                />
              )}

              {/* In-progress polygon */}
              {points.length > 0 && (
                <>
                  <Line
                    points={[...flatten(points), ...(cursor ? [cursor.x, cursor.y] : [])]}
                    stroke={drawColor}
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
                        stroke={drawColor}
                        strokeWidth={2 / scale}
                      />
                    );
                  })}
                </>
              )}
            </Layer>
          </Stage>
        )}

        {labelEditor && (
          <input
            autoFocus
            value={labelEditor.value}
            onChange={(e) => setLabelEditor({ ...labelEditor, value: e.target.value })}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitLabel(); }
              if (e.key === "Escape") { e.preventDefault(); setLabelEditor(null); }
            }}
            placeholder="Label this shape"
            style={{ left: labelEditor.x, top: labelEditor.y }}
            className="absolute z-20 w-44 -translate-x-1/2 -translate-y-1/2 rounded-md border border-teal-500 bg-white px-2 py-1 text-sm shadow-lg outline-none ring-2 ring-teal-500/30"
          />
        )}

        {menu && (
          <>
            <div className="fixed inset-0 z-10" onMouseDown={() => setMenu(null)} />
            <div
              style={{ left: menu.x, top: menu.y }}
              className="absolute z-20 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-xl"
            >
              {menu.kind === "canvas" && (
                <>
                  <MenuItem onClick={() => { onUndo(); setMenu(null); }} disabled={!canUndo}>
                    Undo <Hint>Ctrl Z</Hint>
                  </MenuItem>
                  <MenuItem onClick={() => { onRedo(); setMenu(null); }} disabled={!canRedo}>
                    Redo <Hint>Ctrl Y</Hint>
                  </MenuItem>
                  <div className="my-1 border-t border-gray-100" />
                  <MenuItem onClick={() => { setTool("polygon"); setPoints([]); setMenu(null); }}>
                    Draw polygon <Hint>D</Hint>
                  </MenuItem>
                  <MenuItem onClick={() => { setTool("rectangle"); setMenu(null); }}>Draw rectangle <Hint>R</Hint></MenuItem>
                  <MenuItem onClick={() => { setTool("circle"); setMenu(null); }}>Draw circle <Hint>C</Hint></MenuItem>
                  <div className="my-1 border-t border-gray-100" />
                  <MenuItem onClick={() => { onSelectionChange(polygons.map((p) => p.id)); setMenu(null); }} disabled={polygons.length === 0}>
                    Select all <Hint>Ctrl A</Hint>
                  </MenuItem>
                  <MenuItem onClick={() => { setShowShapes((v) => !v); setMenu(null); }}>
                    {showShapes ? "Hide shapes" : "Show shapes"} <Hint>H</Hint>
                  </MenuItem>
                </>
              )}

              {menu.kind === "vertex" && menuPolygon && (
                <>
                  <MenuItem onClick={() => { removeVertex(menuPolygon, menu.index); setMenu(null); }}
                    disabled={pointsFor(menuPolygon).length <= 3}>
                    Delete point
                  </MenuItem>
                  <MenuItem onClick={() => openLabelEditor(menuPolygon)}>Rename shape</MenuItem>
                </>
              )}

              {menu.kind === "shape" && menuPolygon && (
                <>
                  <MenuItem onClick={() => {
                    const edge = nearestEdge(pointsFor(menuPolygon), menu.at);
                    insertVertex(menuPolygon, edge.index, edge.point);
                    setMenu(null);
                  }}>
                    Insert point here
                  </MenuItem>
                  <MenuItem onClick={() => { setEditPoints(true); setMenu(null); }}>
                    Edit points <Hint>E</Hint>
                  </MenuItem>
                  <MenuItem onClick={() => openLabelEditor(menuPolygon)}>Rename <Hint>Enter</Hint></MenuItem>
                  <MenuItem
                    onClick={() => {
                      onUpdate(menuPolygon.id, { label_x: null, label_y: null });
                      setMenu(null);
                    }}
                    disabled={menuPolygon.label_x == null || menuPolygon.label_y == null}
                  >
                    Reset label position
                  </MenuItem>
                  <MenuItem onClick={() => { onDuplicate(selectedIds.length ? selectedIds : [menuPolygon.id]); setMenu(null); }}>
                    Duplicate <Hint>Ctrl D</Hint>
                  </MenuItem>

                  <div className="relative" onMouseEnter={() => setCopyOpen(true)} onMouseLeave={() => setCopyOpen(false)}>
                    <MenuItem disabled={otherImages.length === 0}>
                      Copy to image <span className="ml-auto text-gray-400">›</span>
                    </MenuItem>
                    {copyOpen && otherImages.length > 0 && (
                      <div className="absolute left-full top-0 z-30 max-h-56 w-40 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
                        {otherImages.map((img) => (
                          <MenuItem key={img.id} onClick={() => {
                            onCopyToImage(selectedIds.length ? selectedIds : [menuPolygon.id], img.id);
                            setMenu(null);
                          }}>
                            Image {images.findIndex((i) => i.id === img.id) + 1}
                          </MenuItem>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="my-1 border-t border-gray-100" />
                  <div className="flex items-center gap-1.5 px-3 py-1.5">
                    {POLYGON_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Colour ${color}`}
                        onClick={() => { setColorOnSelection(color, menuPolygon.id); setMenu(null); }}
                        className="h-4 w-4 rounded-full ring-1 ring-black/10 transition hover:scale-110"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      aria-label="Custom colour"
                      value={menuPolygon.color}
                      onChange={(e) => setColorOnSelection(e.target.value, menuPolygon.id)}
                      className="ml-auto h-5 w-6 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
                    />
                  </div>
                  <div className="my-1 border-t border-gray-100" />

                  <MenuItem danger onClick={() => {
                    onDelete(selectedIds.length ? selectedIds : [menuPolygon.id]);
                    setMenu(null);
                  }}>
                    Delete <Hint>Del</Hint>
                  </MenuItem>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-gray-400">
        V select · D polygon · R rectangle · S square · T triangle · C circle · E edit points ·
        H hide · Enter rename · Del delete · Ctrl+Z undo · Ctrl+Y redo · Ctrl+D duplicate ·
        Ctrl+A select all · arrows nudge · 1–6 colour · [ ] change image · right-click for more
      </p>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="ml-auto pl-3 font-mono text-[10px] text-gray-400">{children}</span>;
}

function MenuItem({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center px-3 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}
