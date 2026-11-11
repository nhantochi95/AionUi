import React, { useMemo, useState } from 'react';
import { Spin } from '@arco-design/web-react';
import { ActionInboxHeader } from './components/ActionInboxHeader';
import { ActionInboxFilterTabs, type InboxFilterTab } from './components/ActionInboxFilterTabs';
import { ActionInboxCardStack } from './components/ActionInboxCardStack';
import { useActionInbox } from './hooks/useActionInbox';
import { HoistedPreviewPanel } from '@renderer/pages/shared-room/components/HoistedPreviewPanel';
import type { ISharedRoomTask } from '@/common/types/sharedRoom';

const ActionInboxPage: React.FC = () => {
  const { items, pendingCount, isLoading, resolveCard } = useActionInbox();
  const [activeTab, setActiveTab] = useState<InboxFilterTab>('pending');
  const [selectedCardId, setSelectedCardId] = useState<string | undefined>();

  const pendingItems = items.filter((card) => card.status === 'pending');
  const resolvedItems = items.filter((card) => card.status === 'resolved');

  const displayedItems = activeTab === 'pending' ? pendingItems : resolvedItems;

  const selectedCard = useMemo(
    () => items.find((card) => card.id === selectedCardId) ?? null,
    [items, selectedCardId]
  );

  const previewTask = useMemo<ISharedRoomTask | null>(() => {
    if (!selectedCard) return null;
    return {
      id: selectedCard.id,
      room_id: selectedCard.target_id,
      from_team_id: null,
      to_team_id: selectedCard.target_id,
      to_team_name: String(selectedCard.details?.team_name || selectedCard.target_id),
      title: selectedCard.title,
      description: selectedCard.summary,
      status:
        selectedCard.status === 'resolved'
          ? 'completed'
          : selectedCard.category === 'approve_done'
            ? 'in_review'
            : 'in_progress',
      blocked_by: [],
      artifacts: [],
      created_at: selectedCard.created_at,
      updated_at: selectedCard.updated_at,
    };
  }, [selectedCard]);

  const previewLeaseId = useMemo(() => {
    if (!selectedCard) return undefined;
    if (typeof selectedCard.details?.lease_id === 'string') {
      return selectedCard.details.lease_id;
    }
    if (selectedCard.target_type === 'worktree') {
      return selectedCard.target_id;
    }
    return undefined;
  }, [selectedCard]);

  return (
    <div className='flex flex-1 h-full min-h-0 bg-bg-1 overflow-hidden'>
      <div className='flex flex-col flex-1 h-full min-h-0 overflow-y-auto p-24px'>
        <div className='max-w-960px w-full mx-auto flex flex-col gap-20px'>
          {/* Header */}
          <ActionInboxHeader pendingCount={pendingCount} />

          {/* Filter Tabs */}
          <ActionInboxFilterTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            pendingCount={pendingItems.length}
            resolvedCount={resolvedItems.length}
          />

          {/* Content Stack */}
          {isLoading && items.length === 0 ? (
            <div className='flex items-center justify-center p-48px'>
              <Spin dot />
            </div>
          ) : (
            <ActionInboxCardStack
              items={displayedItems}
              onResolve={resolveCard}
              selectedCardId={selectedCardId}
              onSelectCard={setSelectedCardId}
              isResolvedTab={activeTab === 'resolved'}
            />
          )}
        </div>
      </div>

      {/* Right-Side 380px Hoisted Preview Panel when a decision card is selected */}
      <HoistedPreviewPanel
        open={Boolean(selectedCard)}
        onClose={() => setSelectedCardId(undefined)}
        selectedTaskId={selectedCard?.id}
        task={previewTask}
        worktreeLeaseId={previewLeaseId}
        roomName={String(selectedCard?.details?.room_name || selectedCard?.target_id || 'inbox')}
        onApproveTaskDone={() => {
          if (selectedCard && selectedCard.status === 'pending') {
            void resolveCard(selectedCard.id, 'approve');
          }
        }}
        onMergeSuccess={() => {
          if (selectedCard && selectedCard.status === 'pending') {
            void resolveCard(selectedCard.id, 'approve');
          }
        }}
      />
    </div>
  );
};

export default ActionInboxPage;
