import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tag } from '@arco-design/web-react';
import { Send, AlarmClock } from '@icon-park/react';
import { BaseInboxCard } from './BaseInboxCard';
import type { ActionInboxCardDto } from '@/common/types/inbox';

export interface MaxHopsCardProps {
  card: ActionInboxCardDto;
  onResolve: (id: string, action: string, payload?: unknown) => void;
  isSelected?: boolean;
  onSelect?: () => void;
}

export const MaxHopsCard: React.FC<MaxHopsCardProps> = ({
  card,
  onResolve,
  isSelected,
  onSelect,
}) => {
  const { t } = useTranslation();
  const isResolved = card.status === 'resolved';

  const details = card.details || {};
  const currentHops = details.current_hops ?? 18;
  const maxHops = details.max_hops ?? 20;

  const actions = (
    <>
      <Button
        size='small'
        type='secondary'
        status='danger'
        disabled={isResolved}
        onClick={() => onResolve(card.id, 'reject')}
      >
        {t('team.actionInbox.maxHops.stopBtn', 'Stop Agent')}
      </Button>
      <Button
        size='small'
        type='primary'
        disabled={isResolved}
        onClick={() => onResolve(card.id, 'approve', { grant_hops: 5 })}
      >
        {t('team.actionInbox.maxHops.unlockBtn', '+ Extend 5 Hops')}
      </Button>
    </>
  );

  return (
    <BaseInboxCard
      card={card}
      categoryLabel={t('team.actionInbox.maxHops.title', 'Max-Hops Loop Guard')}
      categoryColor='gold'
      priority='P0'
      actions={actions}
      isSelected={isSelected}
      onSelect={onSelect}
    >
      <div className='flex items-center justify-between gap-8px p-10px rd-8px bg-fill-2 text-12px'>
        <div className='flex items-center gap-6px'>
          <Tag color='gold' size='small' className='flex items-center gap-4px'>
            <AlarmClock size='12' />
            <span>{currentHops} / {maxHops} hops</span>
          </Tag>
          <span className='text-t-secondary text-11px'>
            {t('team.actionInbox.maxHops.desc', 'Autonomous discussion rounds reached limit')}
          </span>
        </div>
        <Tag color='arcoblue' size='small' className='flex items-center gap-4px'>
          <Send size='12' />
          <span>{t('team.actionInbox.maxHops.telegramSynced', 'Telegram Synced')}</span>
        </Tag>
      </div>
    </BaseInboxCard>
  );
};
