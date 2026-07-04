// Shared API types — mirror the Django serializers (see backend + APIs-and-Routes.md).

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export interface Tag {
  id: number;
  name: string;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  order: number;
  tags: Tag[];
  created_at: string;
  updated_at: string;
}

export interface TaskInput {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  tag_ids: number[];
}

export interface AnnotationImage {
  id: number;
  file: string;
  width: number;
  height: number;
  uploaded_at: string;
  polygons?: Polygon[];
}

// Points are normalized 0–1 relative to the image dimensions.
export type Point = [number, number];

export interface Polygon {
  id: number;
  label: string;
  color: string;
  points: Point[];
  created_at: string;
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];
