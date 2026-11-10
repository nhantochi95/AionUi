import React, { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import {
  KANBAN_COLUMNS,
  normalizeTaskStatus,
  type KanbanColumnKey,
  type KanbanTask,
} from './kanbanTypes';

export interface HybridKanbanBoardProps {
  tasks: KanbanTask[];
  onTaskStatusChange?: (taskId: string, targetStatus: KanbanColumnKey) => Promise<void> | void;
  onStatusChange?: (taskId: string, targetStatus: KanbanColumnKey) => Promise<void> | void;
  selectedTaskId?: string;
  onSelectTask?: (id: string) => void;
  roomId?: string;
}

export const HybridKanbanBoard: React.FC<HybridKanbanBoardProps> = ({
  tasks,
  onTaskStatusChange,
  onStatusChange,
  selectedTaskId,
  onSelectTask,
  roomId = 'default',
}) => {
  const [collapsedCols, setCollapsedCols] = useState<Record<KanbanColumnKey, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`aionui:kanban:collapsed:${roomId}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    // Smart default: collapse Backlog and Done if empty
    return {
      backlog: true,
      todo: false,
      in_progress: false,
      in_review: false,
      done: true,
    };
  });

  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const toggleColumnCollapse = (key: KanbanColumnKey) => {
    setCollapsedCols((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(`aionui:kanban:collapsed:${roomId}`, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Group tasks by normalized column
  const columnTasksMap = useMemo(() => {
    const map: Record<KanbanColumnKey, KanbanTask[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
    };

    for (const task of tasks) {
      const col = normalizeTaskStatus(task.status);
      map[col].push(task);
    }
    return map;
  }, [tasks]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = String(active.id);
    let targetCol: KanbanColumnKey | undefined;

    // Check if dropped directly onto a column
    if (KANBAN_COLUMNS.some((c) => c.key === over.id)) {
      targetCol = over.id as KanbanColumnKey;
    } else {
      // Dropped onto another task card, find that task's column
      const overTask = tasks.find((t) => t.id === over.id);
      if (overTask) {
        targetCol = normalizeTaskStatus(overTask.status);
      }
    }

    if (!targetCol) return;

    const currentTask = tasks.find((t) => t.id === taskId);
    if (currentTask && normalizeTaskStatus(currentTask.status) !== targetCol) {
      const cb = onTaskStatusChange || onStatusChange;
      if (cb) {
        void cb(taskId, targetCol);
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        data-testid='hybrid-kanban-board'
        className='flex h-full w-full gap-12px overflow-x-auto p-12px box-border items-stretch'
      >
        {KANBAN_COLUMNS.map((col) => (
          <KanbanColumn
            key={col.key}
            column={col}
            tasks={columnTasksMap[col.key]}
            collapsed={Boolean(collapsedCols[col.key])}
            onToggleCollapse={toggleColumnCollapse}
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? <KanbanCard task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  );
};
