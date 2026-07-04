"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  uploadImage,
} from "@/lib/api";
import type { AnnotationImage, Point, Polygon } from "@/lib/types";

// react-konva touches the browser canvas API — never render it on the server.
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

function AnnotateView() {
  const { toast } = useToast();
  const [images, setImages] = useState<AnnotationImage[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [polygons, setPolygons] = useState<Polygon[]>([]);
  const [selectedPolygon, setSelectedPolygon] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const activeImage = useMemo(
    () => images.find((img) => img.id === activeId) ?? null,
    [images, activeId]
  );

  useEffect(() => {
    fetchImages()
      .then((data) => {
        setImages(data);
        if (data.length > 0) setActiveId(data[0].id);
      })
      .catch(() => toast("Couldn't load your images.", "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  // Load polygons for the active image.
  useEffect(() => {
    if (activeId === null) {
      setPolygons([]);
      return;
    }
    setSelectedPolygon(null);
    fetchPolygons(activeId)
      .then(setPolygons)
      .catch(() => toast("Couldn't load shapes for this image.", "error"));
  }, [activeId, toast]);

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

  async function handleCreatePolygon(points: Point[], color: string) {
    if (activeId === null) return;
    try {
      const created = await createPolygon(activeId, points, color);
      setPolygons((prev) => [...prev, created]);
      setSelectedPolygon(created.id);
    } catch {
      toast("Couldn't save the shape.", "error");
    }
  }

  async function handleDeletePolygon(id: number) {
    const previous = polygons;
    setPolygons((prev) => prev.filter((p) => p.id !== id));
    if (selectedPolygon === id) setSelectedPolygon(null);
    try {
      await deletePolygon(id);
    } catch {
      setPolygons(previous);
      toast("Couldn't delete the shape.", "error");
    }
  }

  return (
    <div className="min-h-screen bg-powder">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Annotation tool</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload images, draw polygons, and manage your shapes.
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
                    polygons={polygons}
                    selectedId={selectedPolygon}
                    onSelect={setSelectedPolygon}
                    onCreate={handleCreatePolygon}
                    onDeleteSelected={() =>
                      selectedPolygon !== null && handleDeletePolygon(selectedPolygon)
                    }
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
                  selectedId={selectedPolygon}
                  onSelect={setSelectedPolygon}
                  onDelete={handleDeletePolygon}
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
