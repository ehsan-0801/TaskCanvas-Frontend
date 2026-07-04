"use client";

import {
  closestCorners,
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useEffect, useMemo, useRef, useState } from "react";

import { reorderTasks } from "@/lib/api";
import type { Task, TaskStatus } from "@/lib/types";
import { STATUS_ORDER } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { Column } from "./Column";
import { TaskCardOverlay } from "./TaskCard";

type Columns = Record<TaskStatus, Task[]>;

function group(tasks: Task[]): Columns {
  const columns: Columns = { todo: [], in_progress: [], done: [] };
  [...tasks]
    .sort((a, b) => a.order - b.order)
    .forEach((task) => columns[task.status].push(task));
  return columns;
}

function flatten(columns: Columns): Task[] {
  const result: Task[] = [];
  STATUS_ORDER.forEach((status) => {
    columns[status].forEach((task, index) =>
      result.push({ ...task, status, order: index })
    );
  });
  return result;
}

interface BoardProps {
  tasks: Task[];
  onChange: (tasks: Task[]) => void;
  onAdd: (status: TaskStatus) => void;
  onEdit: (task: Task) => void;
}

export function Board({ tasks, onChange, onAdd, onEdit }: BoardProps) {
  const { toast } = useToast();
  const [columns, setColumns] = useState<Columns>(() => group(tasks));
  const [activeId, setActiveId] = useState<number | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);
  const snapshot = useRef<Task[] | null>(null);

  // Sync from the server-owned list, but never mid-drag (would fight the user).
  useEffect(() => {
    if (activeId === null) setColumns(group(tasks));
  }, [tasks, activeId]);

  const sensors = useSensors(
    // A small activation distance so a plain click still opens the edit modal.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function findContainer(id: number | string | undefined): TaskStatus | null {
    if (id === undefined) return null;
    if (STATUS_ORDER.includes(id as TaskStatus)) return id as TaskStatus;
    return (
      STATUS_ORDER.find((status) => columns[status].some((t) => t.id === id)) ?? null
    );
  }

  const activeTask = useMemo(() => {
    if (activeId === null) return null;
    for (const status of STATUS_ORDER) {
      const found = columns[status].find((t) => t.id === activeId);
      if (found) return found;
    }
    return null;
  }, [activeId, columns]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
    snapshot.current = flatten(columns);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeContainer = findContainer(Number(active.id));
    const overContainer = findContainer(
      typeof over.id === "string" ? over.id : Number(over.id)
    );
    if (!activeContainer || !overContainer) return;
    setOverColumn(overContainer);
    if (activeContainer === overContainer) return;

    // Move the card into the new column at the hovered position.
    setColumns((prev) => {
      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      const moved = activeItems.find((t) => t.id === Number(active.id));
      if (!moved) return prev;

      let overIndex = overItems.findIndex((t) => t.id === Number(over.id));
      if (overIndex === -1) overIndex = overItems.length;

      return {
        ...prev,
        [activeContainer]: activeItems.filter((t) => t.id !== Number(active.id)),
        [overContainer]: [
          ...overItems.slice(0, overIndex),
          { ...moved, status: overContainer },
          ...overItems.slice(overIndex),
        ],
      };
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setOverColumn(null);
    if (!over) return;

    const container = findContainer(
      typeof over.id === "string" ? over.id : Number(over.id)
    );
    if (!container) return;

    let nextColumns = columns;
    const items = columns[container];
    const oldIndex = items.findIndex((t) => t.id === Number(active.id));
    let newIndex = items.findIndex((t) => t.id === Number(over.id));
    if (newIndex === -1) newIndex = items.length - 1;

    if (oldIndex !== -1 && oldIndex !== newIndex) {
      nextColumns = { ...columns, [container]: arrayMove(items, oldIndex, newIndex) };
      setColumns(nextColumns);
    }

    const flat = flatten(nextColumns);
    const before = snapshot.current;
    snapshot.current = null;

    // Only persist tasks whose status or order actually changed.
    const beforeById = new Map((before ?? tasks).map((t) => [t.id, t]));
    const updates = flat
      .filter((t) => {
        const prev = beforeById.get(t.id);
        return !prev || prev.status !== t.status || prev.order !== t.order;
      })
      .map((t) => ({ id: t.id, status: t.status, order: t.order }));

    if (updates.length === 0) return;

    onChange(flat); // optimistic
    try {
      await reorderTasks(updates);
    } catch {
      // Roll back to the pre-drag snapshot — never leave UI disagreeing with server.
      const reverted = before ?? tasks;
      onChange(reverted);
      setColumns(group(reverted));
      toast("Couldn't save the change — reverted.", "error");
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STATUS_ORDER.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={columns[status]}
            onAdd={onAdd}
            onEdit={onEdit}
            isActiveDropTarget={activeId !== null && overColumn === status}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? <TaskCardOverlay task={activeTask} onEdit={() => {}} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
