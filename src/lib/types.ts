// Shared API types — mirror the Django serializers (see backend + APIs-and-Routes.md).

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export type TeamRole = "owner" | "member";

export interface Team {
  id: number;
  name: string;
  owner: number;
  role: TeamRole;
  member_count: number;
  created_at: string;
}

export interface Board {
  id: number;
  team: number;
  name: string;
  created_at: string;
}

export interface Member {
  user_id: number;
  email: string;
  name: string;
  role: TeamRole;
  created_at: string;
}

export interface BoardGrant {
  id: number;
  user_id: number;
  email: string;
  created_at: string;
}

export interface Tag {
  id: number;
  name: string;
  team: number;
}

export interface Task {
  id: number;
  board: number;
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
  board: number;
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
  // Where the label chip sits, normalized 0–1. Null means "not placed by hand" —
  // the canvas then draws it at the shape's centre.
  label_x: number | null;
  label_y: number | null;
  created_at: string;
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];
