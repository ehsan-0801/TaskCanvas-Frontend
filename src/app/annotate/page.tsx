"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { ImageStrip } from "@/components/annotate/ImageStrip";
import { PolygonList } from "@/components/annotate/PolygonList";
import { UploadZone } from "@/components/annotate/UploadZone";
import { useToast } from "@/components/ui/Toast";
import {
  createPolygon,
  deleteImage,
  deletePolygon,
  fetchImages,
  fetchPolygons,
  updatePolygon,
  uploadImage,
} from "@/lib/api";
import type { AnnotationImage, Point, Polygon } from "@/lib/types";

const AnnotationCanvas = dynamic(
  () => import("@/components/annotate/AnnotationCanvas").then((m) => m.AnnotationCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-96 items-center justify-center rounded-2xl border border-gray-200 bg-slate-100">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-teal-600" />
      </div>
    ),
  }
);

const DUPLICATE_OFFSET = 0.02;

type PolygonPatch = Partial<Pick<Polygon, "label" | "color" | "points" | "label_x" | "label_y">>;

/** Enough of a shape to recreate it after an undo. */
interface SavedShape {
  id: number;
  points: Point[];
  color: string;
  label: string;
  label_x: number | null;
  label_y: number | null;
}

/**
 * One undoable action. Recreating a deleted shape gives it a *new* server id,
 * so ids inside the stacks are remapped whenever that happens.
 */
type Op =
  | { type: "add"; items: SavedShape[] }
  | { type: "remove"; items: SavedShape[] }
  | { type: "modify"; id: number; before: PolygonPatch; after: PolygonPatch };

const toSaved = (p: Polygon): SavedShape => ({
  id: p.id,
  points: p.points,
  color: p.color,
  label: p.label,
  label_x: p.label_x,
  label_y: p.label_y,
});

/** Recreate a shape exactly as it was, label placement included. */
const restore = (imageId: number, s: SavedShape) =>
  createPolygon(imageId, s.points, s.color, s.label, s.label_x, s.label_y);

function AnnotateView() {
  const { toast } = useToast();
  const [images, setImages] = useState<AnnotationImage[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [polygons, setPolygons] = useState<Polygon[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Record<string, number>>({});

  // History is per-image and lives in refs so the handlers never read a stale copy.
  // The two booleans mirror the stacks for rendering (a ref isn't reactive).
  const undoStack = useRef<Op[]>([]);
  const redoStack = useRef<Op[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncHistory = useCallback(() => {
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  const activeImage = useMemo(
    () => images.find((img) => img.id === activeId) ?? null,
    [images, activeId]
  );

  const record = useCallback(
    (op: Op) => {
      undoStack.current.push(op);
      redoStack.current = []; // a fresh action invalidates the redo branch
      syncHistory();
    },
    [syncHistory]
  );

  /** After a shape is recreated it has a new id — rewrite every reference to it. */
  const remapId = useCallback((oldId: number, newId: number) => {
    const fix = (ops: Op[]) =>
      ops.map((op): Op => {
        if (op.type === "modify") return op.id === oldId ? { ...op, id: newId } : op;
        return {
          ...op,
          items: op.items.map((it) => (it.id === oldId ? { ...it, id: newId } : it)),
        };
      });
    undoStack.current = fix(undoStack.current);
    redoStack.current = fix(redoStack.current);
    setSelectedIds((prev) => prev.map((id) => (id === oldId ? newId : id)));
  }, []);

  useEffect(() => {
    fetchImages()
      .then((data) => {
        setImages(data);
        if (data.length > 0) setActiveId(data[0].id);
      })
      .catch(() => toast("Couldn't load your images.", "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  // Switching image resets the selection and the history.
  useEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    syncHistory();
    if (activeId === null) {
      setPolygons([]);
      return;
    }
    setSelectedIds([]);
    fetchPolygons(activeId)
      .then(setPolygons)
      .catch(() => toast("Couldn't load shapes for this image.", "error"));
  }, [activeId, toast, syncHistory]);

  /* ------------------------------ uploads -------------------------------- */

  const handleUpload = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        setProgress((p) => ({ ...p, [file.name]: 0 }));
        try {
          const uploaded = await uploadImage(file, (pct) =>
            setProgress((p) => ({ ...p, [file.name]: pct }))
          );
          setImages((prev) => [uploaded, ...prev]);
          setActiveId((current) => current ?? uploaded.id);
        } catch {
          toast(`Failed to upload ${file.name}.`, "error");
        } finally {
          setProgress((p) => {
            const next = { ...p };
            delete next[file.name];
            return next;
          });
        }
      }
    },
    [toast]
  );

  async function handleDeleteImage(id: number) {
    const previous = images;
    setImages((prev) => prev.filter((img) => img.id !== id));
    if (activeId === id) {
      const remaining = images.filter((img) => img.id !== id);
      setActiveId(remaining.length > 0 ? remaining[0].id : null);
    }
    try {
      await deleteImage(id);
      toast("Image deleted.", "success");
    } catch {
      setImages(previous);
      toast("Couldn't delete the image.", "error");
    }
  }

  /* ------------------------------- shapes -------------------------------- */

  async function handleCreatePolygon(points: Point[], color: string) {
    if (activeId === null) return;
    try {
      const created = await createPolygon(activeId, points, color);
      setPolygons((prev) => [...prev, created]);
      setSelectedIds([created.id]);
      record({ type: "add", items: [toSaved(created)] });
    } catch {
      toast("Couldn't save the shape.", "error");
    }
  }

  async function handleUpdatePolygon(id: number, patch: PolygonPatch) {
    const current = polygons.find((p) => p.id === id);
    if (!current) return;

    // Snapshot just the fields being changed, so undo can put them back.
    const before: PolygonPatch = {};
    if (patch.points !== undefined) before.points = current.points;
    if (patch.color !== undefined) before.color = current.color;
    if (patch.label !== undefined) before.label = current.label;
    if (patch.label_x !== undefined) before.label_x = current.label_x;
    if (patch.label_y !== undefined) before.label_y = current.label_y;

    const previous = polygons;
    setPolygons((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    try {
      const updated = await updatePolygon(id, patch);
      setPolygons((prev) => prev.map((p) => (p.id === id ? updated : p)));
      record({ type: "modify", id, before, after: patch });
    } catch {
      setPolygons(previous);
      toast("Couldn't update the shape.", "error");
    }
  }

  async function handleDeletePolygons(ids: number[]) {
    if (ids.length === 0) return;
    const removed = polygons.filter((p) => ids.includes(p.id));
    const previous = polygons;
    setPolygons((prev) => prev.filter((p) => !ids.includes(p.id)));
    setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    try {
      await Promise.all(ids.map((id) => deletePolygon(id)));
      record({ type: "remove", items: removed.map(toSaved) });
    } catch {
      setPolygons(previous);
      toast("Couldn't delete the shape(s).", "error");
    }
  }

  async function handleDuplicate(ids: number[]) {
    if (activeId === null || ids.length === 0) return;
    const sources = polygons.filter((p) => ids.includes(p.id));
    try {
      const copies = await Promise.all(
        sources.map((p) =>
          createPolygon(
            activeId,
            p.points.map(
              ([x, y]) =>
                [Math.min(1, x + DUPLICATE_OFFSET), Math.min(1, y + DUPLICATE_OFFSET)] as Point
            ),
            p.color,
            p.label,
            // A hand-placed label shifts with its copy; an auto one stays auto.
            p.label_x === null ? null : Math.min(1, p.label_x + DUPLICATE_OFFSET),
            p.label_y === null ? null : Math.min(1, p.label_y + DUPLICATE_OFFSET)
          )
        )
      );
      setPolygons((prev) => [...prev, ...copies]);
      setSelectedIds(copies.map((c) => c.id));
      record({ type: "add", items: copies.map(toSaved) });
    } catch {
      toast("Couldn't duplicate the shape(s).", "error");
    }
  }

  // Copying to another image isn't undoable here — it changes a different image.
  async function handleCopyToImage(ids: number[], targetImageId: number) {
    const sources = polygons.filter((p) => ids.includes(p.id));
    if (sources.length === 0) return;
    try {
      await Promise.all(sources.map((p) => restore(targetImageId, toSaved(p))));
      const target = images.findIndex((img) => img.id === targetImageId);
      toast(
        `Copied ${sources.length} shape${sources.length > 1 ? "s" : ""} to image ${target + 1}.`,
        "success"
      );
    } catch {
      toast("Couldn't copy the shape(s).", "error");
    }
  }

  /* ----------------------------- undo / redo ----------------------------- */

  const undo = useCallback(async () => {
    const op = undoStack.current.pop();
    if (!op) return;
    syncHistory();
    try {
      if (op.type === "add") {
        const ids = op.items.map((i) => i.id);
        setPolygons((prev) => prev.filter((p) => !ids.includes(p.id)));
        setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
        await Promise.all(ids.map((id) => deletePolygon(id)));
        redoStack.current.push(op);
      } else if (op.type === "remove") {
        if (activeId === null) return;
        const restored = await Promise.all(
          op.items.map((it) => restore(activeId, it))
        );
        setPolygons((prev) => [...prev, ...restored]);
        op.items.forEach((it, i) => remapId(it.id, restored[i].id));
        redoStack.current.push({ type: "remove", items: restored.map(toSaved) });
      } else {
        setPolygons((prev) => prev.map((p) => (p.id === op.id ? { ...p, ...op.before } : p)));
        await updatePolygon(op.id, op.before);
        redoStack.current.push(op);
      }
      syncHistory();
    } catch {
      toast("Couldn't undo that.", "error");
    }
  }, [activeId, remapId, toast, syncHistory]);

  const redo = useCallback(async () => {
    const op = redoStack.current.pop();
    if (!op) return;
    syncHistory();
    try {
      if (op.type === "add") {
        if (activeId === null) return;
        const restored = await Promise.all(
          op.items.map((it) => restore(activeId, it))
        );
        setPolygons((prev) => [...prev, ...restored]);
        op.items.forEach((it, i) => remapId(it.id, restored[i].id));
        undoStack.current.push({ type: "add", items: restored.map(toSaved) });
      } else if (op.type === "remove") {
        const ids = op.items.map((i) => i.id);
        setPolygons((prev) => prev.filter((p) => !ids.includes(p.id)));
        setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
        await Promise.all(ids.map((id) => deletePolygon(id)));
        undoStack.current.push(op);
      } else {
        setPolygons((prev) => prev.map((p) => (p.id === op.id ? { ...p, ...op.after } : p)));
        await updatePolygon(op.id, op.after);
        undoStack.current.push(op);
      }
      syncHistory();
    } catch {
      toast("Couldn't redo that.", "error");
    }
  }, [activeId, remapId, toast, syncHistory]);

  const stepImage = useCallback(
    (delta: number) => {
      if (images.length < 2 || activeId === null) return;
      const i = images.findIndex((img) => img.id === activeId);
      setActiveId(images[(i + delta + images.length) % images.length].id);
    },
    [images, activeId]
  );

  function selectPolygon(id: number, additive: boolean) {
    setSelectedIds((prev) => {
      if (!additive) return [id];
      return prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
    });
  }

  return (
    <div className="min-h-screen bg-powder">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Annotation tool</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload images, draw and edit shapes, and manage your annotations.
          </p>
        </div>

        {loading ? (
          <div className="flex h-96 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-teal-600" />
          </div>
        ) : images.length === 0 ? (
          <div className="mx-auto max-w-xl py-10">
            <UploadZone onFiles={handleUpload} progress={progress} />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <ImageStrip
                images={images}
                activeId={activeId}
                onSelect={setActiveId}
                onDelete={handleDeleteImage}
              />
              <div className="mt-4">
                <UploadZone onFiles={handleUpload} progress={progress} compact />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_260px]">
              <div>
                {activeImage && (
                  <AnnotationCanvas
                    key={activeImage.id}
                    image={activeImage}
                    images={images}
                    polygons={polygons}
                    selectedIds={selectedIds}
                    onSelectionChange={setSelectedIds}
                    onCreate={handleCreatePolygon}
                    onUpdate={handleUpdatePolygon}
                    onDelete={handleDeletePolygons}
                    onDuplicate={handleDuplicate}
                    onCopyToImage={handleCopyToImage}
                    onPrevImage={() => stepImage(-1)}
                    onNextImage={() => stepImage(1)}
                    onUndo={undo}
                    onRedo={redo}
                    canUndo={canUndo}
                    canRedo={canRedo}
                  />
                )}
              </div>

              <aside className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-gray-900">
                  Shapes
                  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                    {polygons.length}
                  </span>
                </h2>
                <PolygonList
                  polygons={polygons}
                  selectedIds={selectedIds}
                  onSelect={selectPolygon}
                  onDelete={handleDeletePolygons}
                  onUpdate={handleUpdatePolygon}
                />
              </aside>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function AnnotatePage() {
  return (
    <AuthGuard>
      <AnnotateView />
    </AuthGuard>
  );
}
