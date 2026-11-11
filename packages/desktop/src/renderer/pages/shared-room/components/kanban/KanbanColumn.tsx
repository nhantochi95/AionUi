import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Tooltip, Tag } from '@arco-design/web-react';
import classNames from 'classnames';
import { KanbanCard } from './KanbanCard';
import type { KanbanColumnDef, KanbanTask } from './kanbanTypes';

export interface KanbanColumnProps {
  column: KanbanColumnDef;
  tasks: KanbanTask[];
  collapsed: boolean;
  onToggleCollapse: (key: KanbanColumnDef['key']) => void;
  selectedTaskId?: string;
  onSelectTask?: (id: string) => void;
  onApproveDone?: (taskId: string) => void;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  column,
  tasks,
  collapsed,
  onToggleCollapse,
  selectedTaskId,
  onSelectTask,
  onApproveDone,
}) => {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({
    id: column.key,
  });

  const title = t(column.titleKey, column.defaultTitle);
  const taskIds = tasks.map((t) => t.id);

  // 1. Collapsed State: exact 52px vertical strip
  if (collapsed) {
    return (
      <Tooltip
        content={`${title} (${tasks.length}) — ${t('team.sharedRoom.kanban.expandHint', 'Click to expand column')}`}
        position='top'
      >
        <div
          ref={setNodeRef}
          data-testid={`kanban-col-collapsed-${column.key}`}
          onClick={() => onToggleCollapse(column.key)}
          className={classNames(
            'box-border h-full flex flex-col items-center py-14px px-0 rd-12px bg-fill-2 border border-solid border-arco-2 cursor-pointer transition-all select-none hover:bg-fill-3 shrink-0',
            isOver && 'ring-2 ring-[rgb(var(--primary-6))] bg-fill-3'
          )}
          style={{
            flex: '0 0 52px',
            width: '52px',
            minWidth: '52px',
            maxWidth: '52px',
          }}
        >
          {/* Task Count Badge */}
          <span
            data-testid={`kanban-collapsed-badge-${column.key}`}
            className='w-26px h-22px rd-6px bg-bg-1 border border-solid border-arco-2 text-11px font-mono font-bold flex items-center justify-center text-t-primary shadow-xs'
          >
            {tasks.length}
          </span>

          {/* Vertical Label with Stacked Diacritic Protection */}
          <div
            className='text-12px font-bold text-t-secondary tracking-wide flex items-center gap-6px mt-16px'
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              lineHeight: '1.4',
            }}
          >
            <span>{title}</span>
            <span className='text-10px text-t-tertiary font-mono'>»</span>
          </div>

          {column.isHumanOnly && (
            <div className='mt-auto pb-4px text-12px text-orange-500' title={t('team.sharedRoom.kanban.humanOnlyNotice', 'Only humans can move tasks to Done')}>
              🛡️
            </div>
          )}
        </div>
      </Tooltip>
    );
  }

  // 2. Expanded State
  return (
    <div
      ref={setNodeRef}
      data-testid={`kanban-col-expanded-${column.key}`}
      className={classNames(
        'box-border h-full flex flex-col rd-12px bg-fill-2 border border-solid border-arco-2 transition-all min-w-220px flex-1 shrink-0 overflow-hidden',
        isOver && 'ring-2 ring-[rgb(var(--primary-6))] bg-fill-3/60'
      )}
    >
      {/* Column Header */}
      <div
        className='flex items-center justify-between p-12px border-b border-solid border-arco-2 cursor-pointer select-none'
        onClick={() => onToggleCollapse(column.key)}
        title={t('team.sharedRoom.kanban.collapseHint', 'Click column header to collapse to 52px strip')}
      >
        <div className='flex items-center gap-6px min-w-0'>
          <span className='text-13px font-bold text-t-primary truncate'>
            {title}
          </span>
          <span
            data-testid={`kanban-count-${column.key}`}
            className='px-6px py-1px rd-full text-10px font-mono font-bold bg-bg-1 text-t-secondary border border-arco-2'
          >
            {tasks.length}
          </span>
          {column.isHumanOnly && (
            <Tag color='orange' size='small' className='text-10px px-4px py-0'>
              {t('team.sharedRoom.kanban.humanOnlyBadge', '🛡️ Human Only')}
            </Tag>
          )}
        </div>

        <button
          type='button'
          className='border-0 bg-transparent text-t-tertiary hover:text-t-primary text-11px cursor-pointer flex items-center gap-2px'
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse(column.key);
          }}
        >
          <span>«</span>
        </button>
      </div>

      {/* Task List / Droppable Body */}
      <div className='flex-1 min-h-0 overflow-y-auto p-8px flex flex-col gap-8px'>
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              isSelected={task.id === selectedTaskId}
              onSelect={() => onSelectTask?.(task.id)}
              onApproveDone={onApproveDone}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div
            className='flex items-center justify-center h-96px border border-dashed border-arco-2 rd-8px text-11px text-t-tertiary cursor-pointer hover:bg-fill-3 select-none text-center px-8px'
            onClick={() => onToggleCollapse(column.key)}
          >
            {t('team.sharedRoom.kanban.emptyHint', 'Empty — click header to collapse')}
          </div>
        )}
      </div>
    </div>
  );
};
