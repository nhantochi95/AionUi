import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tag } from '@arco-design/web-react';
import classNames from 'classnames';
import type { ActionInboxCardDto } from '@/common/types/inbox';

export interface BaseInboxCardProps {
  card: ActionInboxCardDto;
  categoryLabel?: string;
  categoryColor?: string;
  priority?: 'P0' | 'P1' | 'P2';
  children: React.ReactNode;
  actions?: React.ReactNode;
  isSelected?: boolean;
  onSelect?: () => void;
}

export const BaseInboxCard: React.FC<BaseInboxCardProps> = ({
  card,
  categoryLabel,
  categoryColor = 'blue',
  priority = 'P1',
  children,
  actions,
  isSelected,
  onSelect,
}) => {
  const { t } = useTranslation();
  const isResolved = card.status === 'resolved';

  const priorityColor = priority === 'P0' ? 'red' : priority === 'P1' ? 'orangered' : 'gray';

  let statusText = t('team.actionInbox.waitingLabel', '● Waiting for your decision');
  if (isResolved) {
    if (card.resolved_by === 'telegram') {
      statusText = t('team.actionInbox.resolvedByTelegram', '✓ Resolved via Telegram');
    } else {
      statusText = t('team.actionInbox.resolvedLabel', '✓ Resolved');
    }
  }

  return (
    <div
      data-testid={`inbox-card-${card.id}`}
      data-status={card.status}
      onClick={onSelect}
      className={classNames(
        'border border-solid border-arco-2 rd-12px bg-bg-1 p-16px transition-all relative flex flex-col gap-12px cursor-pointer',
        isSelected && 'ring-2 ring-[rgb(var(--primary-6))] shadow-sm',
        isResolved ? 'opacity-48 pointer-events-auto' : 'hover:border-[rgb(var(--primary-6))] hover:shadow-sm'
      )}
      style={{ opacity: isResolved ? 0.48 : 1 }}
    >
      {/* Top Header Row */}
      <div className='flex items-center justify-between gap-8px text-12px'>
        <div className='flex items-center gap-6px flex-wrap'>
          <Tag color={priorityColor} size='small' className='font-bold'>
            {priority}
          </Tag>
          {categoryLabel && (
            <Tag color={categoryColor} size='small'>
              {categoryLabel}
            </Tag>
          )}
          {card.target_id && (
            <span className='text-t-secondary font-mono text-11px'>
              #{card.target_id}
            </span>
          )}
        </div>
        <div className='flex items-center gap-8px text-t-tertiary'>
          <span
            className={classNames(
              'font-medium text-11px',
              isResolved ? 'text-green-600' : 'text-orange-500'
            )}
          >
            {statusText}
          </span>
          <span className='text-11px'>
            {new Date(card.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div className='flex flex-col gap-4px'>
        <div className='text-14px font-bold text-t-primary leading-tight'>
          {card.title}
        </div>
        {card.summary && (
          <div className='text-12px text-t-secondary leading-normal'>
            {card.summary}
          </div>
        )}
      </div>

      {/* Custom Body Content */}
      {children}

      {/* Actions Row */}
      {actions && (
        <div
          className='flex items-center justify-end gap-8px pt-8px border-t border-solid border-arco-1'
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
  );
};
