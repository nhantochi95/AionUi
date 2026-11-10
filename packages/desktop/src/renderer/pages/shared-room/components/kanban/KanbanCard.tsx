import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Tag } from '@arco-design/web-react';
import { Lock } from '@icon-park/react';
import classNames from 'classnames';
import type { KanbanTask } from './kanbanTypes';

export interface KanbanCardProps {
  task: KanbanTask;
  isSelected?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
}

export const KanbanCard: React.FC<KanbanCardProps> = ({
  task,
  isSelected,
  onSelect,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  const hasBlockers = Array.isArray(task.blocked_by) && task.blocked_by.length > 0;
  const subtasksTotal = task.subtasks_total ?? 0;
  const subtasksDone = task.subtasks_done ?? 0;
  const subtaskPercent = subtasksTotal > 0 ? Math.round((subtasksDone / subtasksTotal) * 100) : 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-testid={`kanban-card-${task.id}`}
      onClick={(e) => {
        // Only select if not dragging
        if (!isDragging) {
          onSelect?.();
        }
      }}
      className={classNames(
        'border border-solid border-arco-2 rd-10px bg-bg-1 p-12px transition-all flex flex-col gap-8px cursor-grab select-none hover:border-[rgb(var(--primary-6))] hover:shadow-sm',
        isSelected && 'ring-2 ring-[rgb(var(--primary-6))] shadow-sm',
        isDragging && 'shadow-lg cursor-grabbing'
      )}
    >
      {/* Top Header */}
      <div className='flex items-center justify-between gap-6px flex-wrap'>
        <Tag color='arcoblue' size='small' className='font-medium'>
          @{task.to_team_name || 'Team'}
        </Tag>
        {task.branch ? (
          <span className='font-mono text-green-600 text-10px px-4px py-1px rd-4px bg-green-50 dark:bg-green-950/30'>
            {task.branch}
          </span>
        ) : (
          <span className='font-mono text-t-tertiary text-10px'>
            #{task.id.slice(-6)}
          </span>
        )}
      </div>

      {/* Title */}
      <div className='text-13px font-600 text-t-primary leading-tight line-clamp-2'>
        {task.title}
      </div>

      {/* Description Preview */}
      {task.description && (
        <div className='text-11px text-t-secondary line-clamp-2 leading-normal'>
          {task.description}
        </div>
      )}

      {/* Subtasks Progress */}
      {subtasksTotal > 0 && (
        <div className='flex flex-col gap-3px pt-4px'>
          <div className='flex items-center justify-between text-10px text-t-tertiary'>
            <span>
              {t('team.sharedRoom.kanban.subtasks', 'Subtasks: {{done}}/{{total}}', {
                done: subtasksDone,
                total: subtasksTotal,
              })}
            </span>
            <span>{subtaskPercent}%</span>
          </div>
          <div className='h-3px rd-full bg-fill-3 overflow-hidden'>
            <div
              className='h-full bg-[rgb(var(--primary-6))] rd-full transition-all'
              style={{ width: `${subtaskPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Blocker Alert */}
      {hasBlockers && (
        <div className='flex items-center gap-4px text-10px text-orange-500 font-medium bg-orange-50 dark:bg-orange-950/30 px-6px py-2px rd-4px self-start'>
          <Lock size='10' />
          <span>
            {t('team.sharedRoom.kanban.waitingBlockers', 'Waiting for {{count}} prerequisite task(s)', {
              count: task.blocked_by.length,
            })}
          </span>
        </div>
      )}
    </div>
  );
};
