import axios, {
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from "axios";

import { API_URL } from "./auth";
import type {
  AnnotationImage,
  Point,
  Polygon,
  Tag,
  Task,
  TaskInput,
} from "./types";

// Bridge to the React auth Context. Interceptors run outside React, so the
// AuthProvider registers these accessors to expose the current in-memory token
// (see context/AuthContext.tsx). No localStorage involved.
interface AuthBridge {
  getAccess: () => string | null;
  getRefresh: () => string | null;
  setAccess: (access: string) => void;
  onAuthFailure: () => void;
}

let bridge: AuthBridge | null = null;

export function registerAuthBridge(next: AuthBridge | null) {
  bridge = next;
}

export const api = axios.create({
  baseURL: API_URL,
});

// Attach the access token to every request.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = bridge?.getAccess() ?? null;
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

// On a 401, try to refresh the access token once, then replay the request.
// Repeated failure clears context state and bounces to /login.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = bridge?.getRefresh() ?? null;
  if (!refresh) return null;
  try {
    const { data } = await axios.post(`${API_URL}/api/auth/refresh/`, {
      refresh,
    });
    bridge?.setAccess(data.access);
    return data.access as string;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      | (AxiosRequestConfig & { _retry?: boolean })
      | undefined;

    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;

      // Coalesce concurrent refreshes into one network call.
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;

      if (newToken) {
        original.headers = {
          ...original.headers,
          Authorization: `Bearer ${newToken}`,
        };
        return api(original);
      }
      bridge?.onAuthFailure();
    }
    return Promise.reject(error);
  }
);

/* ----------------------------- Tasks ----------------------------- */

export async function fetchTasks(date: string): Promise<Task[]> {
  const { data } = await api.get<Task[] | { results: Task[] }>("/api/tasks/", {
    params: { date },
  });
  return Array.isArray(data) ? data : data.results ?? [];
}

export async function createTask(input: TaskInput): Promise<Task> {
  const { data } = await api.post<Task>("/api/tasks/", input);
  return data;
}

export async function updateTask(
  id: number,
  input: Partial<TaskInput>
): Promise<Task> {
  const { data } = await api.patch<Task>(`/api/tasks/${id}/`, input);
  return data;
}

export async function deleteTask(id: number): Promise<void> {
  await api.delete(`/api/tasks/${id}/`);
}

export interface ReorderUpdate {
  id: number;
  status: string;
  order: number;
}

export async function reorderTasks(updates: ReorderUpdate[]): Promise<void> {
  await api.post("/api/tasks/reorder/", { updates });
}

/* ------------------------------ Tags ----------------------------- */

export async function fetchTags(): Promise<Tag[]> {
  const { data } = await api.get<Tag[] | { results: Tag[] }>(
    "/api/tasks/tags/"
  );
  return Array.isArray(data) ? data : data.results ?? [];
}

export async function createTag(name: string): Promise<Tag> {
  const { data } = await api.post<Tag>("/api/tasks/tags/", { name });
  return data;
}

/* --------------------------- Annotation -------------------------- */

export async function fetchImages(): Promise<AnnotationImage[]> {
  const { data } = await api.get<AnnotationImage[] | { results: AnnotationImage[] }>(
    "/api/images/"
  );
  return Array.isArray(data) ? data : data.results ?? [];
}

export async function uploadImage(
  file: File,
  onProgress?: (percent: number) => void
): Promise<AnnotationImage> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<AnnotationImage>("/api/images/", form, {
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
  return data;
}

export async function deleteImage(id: number): Promise<void> {
  await api.delete(`/api/images/${id}/`);
}

export async function fetchPolygons(imageId: number): Promise<Polygon[]> {
  const { data } = await api.get<Polygon[] | { results: Polygon[] }>(
    `/api/images/${imageId}/polygons/`
  );
  return Array.isArray(data) ? data : data.results ?? [];
}

export async function createPolygon(
  imageId: number,
  points: Point[],
  color: string,
  label = ""
): Promise<Polygon> {
  const { data } = await api.post<Polygon>(
    `/api/images/${imageId}/polygons/`,
    { points, color, label }
  );
  return data;
}

export async function updatePolygon(
  polygonId: number,
  patch: Partial<Pick<Polygon, "label" | "color" | "points">>
): Promise<Polygon> {
  const { data } = await api.patch<Polygon>(
    `/api/images/polygons/${polygonId}/`,
    patch
  );
  return data;
}

export async function deletePolygon(polygonId: number): Promise<void> {
  await api.delete(`/api/images/polygons/${polygonId}/`);
}

// Backend returns relative media paths in some configs; make them absolute.
export function resolveMediaUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_URL}${url}`;
}
