import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Radio } from '@arco-design/web-react';
import { Check } from '@icon-park/react';
import { BaseInboxCard } from './BaseInboxCard';
import type { ActionInboxCardDto } from '@/common/types/inbox';

export interface MultipleChoiceCardProps {
  card: ActionInboxCardDto;
  onResolve: (id: string, action: string, payload?: unknown) => void;
  isSelected?: boolean;
  onSelect?: () => void;
}

export const MultipleChoiceCard: React.FC<MultipleChoiceCardProps> = ({
  card,
  onResolve,
  isSelected,
  onSelect,
}) => {
  const { t } = useTranslation();
  const isResolved = card.status === 'resolved';

  const details = card.details || {};
  const options: string[] = details.options || [];
  const recommendedIndex: number | undefined = details.recommended_index;

  const [selectedIndex, setSelectedIndex] = useState<number | undefined>(recommendedIndex ?? 0);

  const actions = (
    <Button
      size='small'
      type='primary'
      disabled={isResolved || selectedIndex === undefined}
      onClick={() =>
        onResolve(card.id, 'choice', {
          selected_index: selectedIndex,
          selected_option: options[selectedIndex],
        })
      }
      icon={<Check />}
    >
      {t('team.actionInbox.multipleChoice.confirmBtn', 'Confirm Choice')}
    </Button>
  );

  return (
    <BaseInboxCard
      card={card}
      categoryLabel={t('team.actionInbox.multipleChoice.title', 'Agent Question')}
      categoryColor='purple'
      priority='P1'
      actions={actions}
      isSelected={isSelected}
      onSelect={onSelect}
    >
      <div className='flex flex-col gap-6px p-10px rd-8px bg-fill-2'>
        <Radio.Group
          value={selectedIndex}
          disabled={isResolved}
          onChange={(val) => setSelectedIndex(val)}
          direction='vertical'
          className='w-full'
        >
          {options.map((opt, idx) => (
            <Radio key={idx} value={idx} className='py-4px text-12px'>
              <span className='font-medium'>{opt}</span>
              {recommendedIndex === idx && (
                <span className='ms-6px px-4px py-1px rd-4px text-10px bg-[rgb(var(--primary-1))] text-[rgb(var(--primary-6))] font-bold'>
                  {t('team.actionInbox.multipleChoice.recommended', 'Recommended')}
                </span>
              )}
            </Radio>
          ))}
        </Radio.Group>
      </div>
    </BaseInboxCard>
  );
};
