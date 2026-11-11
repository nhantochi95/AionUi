/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Empty, Spin, Switch, Trigger } from '@arco-design/web-react';
import { CheckSmall, Search } from '@icon-park/react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import type { ModelTargetSpec, TeamQuotaPreset } from '@/common/types/team/teamHubTypes';
import { useCompositionInput } from '@renderer/hooks/chat/useCompositionInput';
import {
  useConnectedModelsCatalog,
  type ConnectedModelFlatItem,
  type ConnectedModelGroup,
} from './useConnectedModelsCatalog';

export type ModelSwitchScopeMode = 'all' | 'teammates_only' | 'slots';

export interface ModelSlotOption {
  slot_id: string;
  name: string;
  isLeader?: boolean;
}

export interface ModelPickerSelectionMeta {
  scope: ModelSwitchScopeMode;
  slotId?: string;
  forceInterrupt: boolean;
}

export interface ConnectedModelPickerPopoverProps {
  children: React.ReactElement;
  disabled?: boolean;
  selectedTarget?: ModelTargetSpec;
  allowClearOverride?: boolean;
  onClearOverride?: () => void;
  showScopeSelector?: boolean;
  defaultScope?: 'all' | 'teammates_only';
  slotOptions?: ModelSlotOption[];
  showForceInterrupt?: boolean;
  defaultForceInterrupt?: boolean;
  teamOptions?: Array<{ team_id: string; team_name: string }>;
  selectedTeamId?: string;
  onSelectTeamId?: (teamId: string) => void;
  panelTestId?: string;
  position?: 'bl' | 'br' | 'tl' | 'tr' | 'bottom' | 'top';
  onSelectModel: (target: ModelTargetSpec, meta: ModelPickerSelectionMeta) => void | Promise<void>;
  onApplyPreset?: (preset: TeamQuotaPreset, forceInterrupt: boolean) => void | Promise<void>;
}

const ConnectedModelPickerPanel: React.FC<{
  selectedTarget?: ModelTargetSpec;
  allowClearOverride?: boolean;
  onClearOverride?: () => void;
  showScopeSelector?: boolean;
  defaultScope?: 'all' | 'teammates_only';
  slotOptions?: ModelSlotOption[];
  showForceInterrupt?: boolean;
  defaultForceInterrupt?: boolean;
  teamOptions?: Array<{ team_id: string; team_name: string }>;
  selectedTeamId?: string;
  onSelectTeamId?: (teamId: string) => void;
  panelTestId?: string;
  onPick: (target: ModelTargetSpec, meta: ModelPickerSelectionMeta) => void;
  onApplyPreset?: (preset: TeamQuotaPreset, forceInterrupt: boolean) => void;
  onClear: () => void;
}> = ({
  selectedTarget,
  allowClearOverride = false,
  showScopeSelector = false,
  defaultScope = 'all',
  slotOptions,
  showForceInterrupt = false,
  defaultForceInterrupt = false,
  teamOptions,
  selectedTeamId,
  onSelectTeamId,
  panelTestId = 'connected-model-picker-panel',
  onPick,
  onApplyPreset,
  onClear,
}) => {
  const { t } = useTranslation();
  const { cliSubscriptionGroups, paidApiGroups, isLoading } = useConnectedModelsCatalog(true);
  const { compositionHandlers, createKeyDownHandler } = useCompositionInput();

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<ModelSwitchScopeMode>(defaultScope);
  const [selectedSlotId, setSelectedSlotId] = useState<string | undefined>(slotOptions?.[0]?.slot_id);
  const [forceInterrupt, setForceInterrupt] = useState<boolean>(defaultForceInterrupt);

  const filterGroups = (groups: ConnectedModelGroup[], q: string): ConnectedModelGroup[] => {
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (it) =>
            it.modelLabel.toLowerCase().includes(q) ||
            it.modelId.toLowerCase().includes(q) ||
            it.sourceTitle.toLowerCase().includes(q) ||
            it.backend.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.items.length > 0);
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredCliGroups = useMemo(
    () => filterGroups(cliSubscriptionGroups, normalizedQuery),
    [cliSubscriptionGroups, normalizedQuery]
  );
  const filteredApiGroups = useMemo(
    () => filterGroups(paidApiGroups, normalizedQuery),
    [paidApiGroups, normalizedQuery]
  );

  const visibleFlatItems = useMemo<ConnectedModelFlatItem[]>(
    () => [...filteredCliGroups.flatMap((g) => g.items), ...filteredApiGroups.flatMap((g) => g.items)],
    [filteredApiGroups, filteredCliGroups]
  );

  const emitSelection = (item: ConnectedModelFlatItem) => {
    onPick(item.target, {
      scope,
      slotId: scope === 'slots' ? selectedSlotId : undefined,
      forceInterrupt,
    });
  };

  const handleSearchKeyDown = createKeyDownHandler(() => {
    if (visibleFlatItems.length > 0) {
      emitSelection(visibleFlatItems[0]);
    }
  });

  const isItemSelected = (item: ConnectedModelFlatItem): boolean => {
    if (!selectedTarget) return false;
    return (
      selectedTarget.backend === item.target.backend &&
      (selectedTarget.provider_id ?? '') === (item.target.provider_id ?? '') &&
      selectedTarget.model_id === item.target.model_id
    );
  };

  const renderGroupSection = (
    sectionTitle: string,
    groups: ConnectedModelGroup[],
    isCliSection: boolean
  ) => {
    if (groups.length === 0) return null;
    return (
      <div className='flex flex-col gap-4px'>
        <div className='px-6px pt-4px pb-2px text-10px font-700 uppercase tracking-wider text-t-tertiary flex items-center justify-between'>
          <span>{sectionTitle}</span>
          <span
            className={classNames(
              'px-5px py-1px rd-4px text-10px font-600',
              isCliSection
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
            )}
          >
            {isCliSection
              ? t('team.modelHub.cliBadge', { defaultValue: '$0 CLI' })
              : t('team.modelHub.apiBadge', { defaultValue: 'API' })}
          </span>
        </div>
        {groups.map((group) => (
          <div
            key={group.groupId}
            className='flex flex-col gap-2px pt-4px border-t border-solid border-b-light first:pt-0 first:border-t-0'
          >
            <div className='px-8px py-3px text-11px font-700 text-t-secondary flex items-center gap-6px'>
              <span className='truncate'>{group.title}</span>
              {group.supportsNativeCompact && (
                <span className='px-5px py-1px rounded-4px bg-2 text-10px font-mono text-t-tertiary'>
                  {t('team.modelHub.nativeCompactBadge', { defaultValue: '/compact' })}
                </span>
              )}
            </div>
            {group.items.map((item) => {
              const active = isItemSelected(item);
              const safeTestKey = `${item.backend}-${item.modelId || 'default'}`;
              return (
                <button
                  key={item.key}
                  type='button'
                  data-testid={`connected-model-option-${safeTestKey}`}
                  data-wallet-type={item.walletType}
                  data-provider-id={item.providerId ?? ''}
                  onClick={() => emitSelection(item)}
                  className={classNames(
                    'w-full flex items-center justify-between gap-8px px-10px py-6px rounded-8px border-0 outline-none text-left cursor-pointer transition-colors text-12px',
                    active
                      ? 'bg-[#165DFF]/12 text-[#165DFF] font-600'
                      : 'bg-transparent text-t-primary hover:bg-2'
                  )}
                >
                  <div className='min-w-0 flex-1 flex items-center gap-6px'>
                    <span className='truncate'>
                      {item.modelLabel === 'Default'
                        ? t('team.modelHub.defaultModel', { defaultValue: 'Default' })
                        : item.modelLabel}
                    </span>
                  </div>
                  <div className='shrink-0 flex items-center gap-6px'>
                    <span
                      className={classNames(
                        'px-6px py-1px rounded-full text-10px font-600 leading-14px',
                        item.walletType === 'cli_subscription'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      )}
                    >
                      {item.walletType === 'cli_subscription'
                        ? t('team.modelHub.cliBadge', { defaultValue: '$0 CLI' })
                        : t('team.modelHub.apiBadge', { defaultValue: 'API' })}
                    </span>
                    {active && <CheckSmall theme='outline' size='14' fill='currentColor' />}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      data-testid={panelTestId}
      className='w-336px max-w-[calc(100vw-24px)] flex flex-col gap-8px rounded-12px border border-solid border-b-base bg-dialog-fill-0 p-12px shadow-xl text-t-primary'
      style={{
        zIndex: 10050,
        backgroundColor: 'var(--dialog-fill-0, var(--bg-1, #ffffff))',
        borderColor: 'var(--border-base, #e5e6eb)',
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Optional multi-team selector (for SharedRoomPage with multiple participating teams) */}
      {teamOptions && teamOptions.length > 1 && onSelectTeamId && (
        <div className='flex items-center gap-4px flex-wrap pb-6px border-b border-solid border-b-base'>
          <span className='text-11px font-600 text-t-tertiary me-2px'>
            {t('team.modelHub.selectTeamLabel', { defaultValue: 'Team' })}:
          </span>
          {teamOptions.map((tm) => (
            <button
              key={tm.team_id}
              type='button'
              data-testid={`model-picker-team-${tm.team_id}`}
              onClick={() => onSelectTeamId(tm.team_id)}
              className={classNames(
                'px-8px py-2px rounded-full text-11px border-0 outline-none cursor-pointer transition-colors truncate max-w-130px',
                selectedTeamId === tm.team_id
                  ? 'bg-[#165DFF] text-white font-600'
                  : 'bg-2 text-t-secondary hover:bg-3'
              )}
            >
              {tm.team_name}
            </button>
          ))}
        </div>
      )}

      {/* 1-Click Quota Presets when onApplyPreset is provided */}
      {onApplyPreset && (
        <div className='flex flex-col gap-5px pb-8px border-b border-solid border-b-base'>
          <span className='text-10px font-700 uppercase tracking-wider text-t-tertiary'>
            {t('team.modelHub.quotaPresetsLabel', { defaultValue: '1-Click Quota Presets' })}
          </span>
          <div className='grid grid-cols-2 gap-6px'>
            <button
              type='button'
              data-testid='model-picker-preset-smart-split'
              onClick={() => onApplyPreset('smart_split', forceInterrupt)}
              className='px-8px py-6px rounded-8px text-11px font-600 text-left border border-solid border-[#165DFF]/35 bg-[#165DFF]/10 hover:bg-[#165DFF]/18 text-[#165DFF] cursor-pointer transition-colors outline-none'
            >
              {t('team.modelHub.presetSmartSplitShort', { defaultValue: 'Smart Split ($0 Workers)' })}
            </button>
            <button
              type='button'
              data-testid='model-picker-preset-free-cli'
              onClick={() => onApplyPreset('all_free_cli', forceInterrupt)}
              className='px-8px py-6px rounded-8px text-11px font-600 text-left border border-solid border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/18 text-emerald-700 dark:text-emerald-300 cursor-pointer transition-colors outline-none'
            >
              {t('team.modelHub.presetAllFreeCli', { defaultValue: '100% $0 CLI' })}
            </button>
          </div>
        </div>
      )}

      {/* Optional Scope Selector: All Members (incl. Leader) vs Teammates Only */}
      {showScopeSelector && (
        <div className='flex flex-col gap-6px pb-8px border-b border-solid border-b-base'>
          <span className='text-11px font-600 text-t-secondary'>
            {t('team.modelHub.scopeLabel', { defaultValue: 'Target Scope' })}
          </span>
          <div className='grid grid-cols-1 gap-4px'>
            <button
              type='button'
              data-testid='model-picker-scope-all'
              aria-pressed={scope === 'all'}
              onClick={() => setScope('all')}
              className={classNames(
                'px-10px py-6px rounded-8px text-12px text-left border border-solid outline-none cursor-pointer transition-colors',
                scope === 'all'
                  ? 'border-[#165DFF] bg-[#165DFF]/10 text-[#165DFF] font-600'
                  : 'border-b-base bg-2 text-t-secondary hover:bg-3'
              )}
            >
              {t('team.modelHub.scopeAll', { defaultValue: 'All Members (incl. Leader)' })}
            </button>
            <button
              type='button'
              data-testid='model-picker-scope-teammates'
              aria-pressed={scope === 'teammates_only'}
              onClick={() => setScope('teammates_only')}
              className={classNames(
                'px-10px py-6px rounded-8px text-12px text-left border border-solid outline-none cursor-pointer transition-colors',
                scope === 'teammates_only'
                  ? 'border-[#165DFF] bg-[#165DFF]/10 text-[#165DFF] font-600'
                  : 'border-b-base bg-2 text-t-secondary hover:bg-3'
              )}
            >
              {t('team.modelHub.scopeTeammatesOnly', { defaultValue: 'Teammates Only (Keep Leader)' })}
            </button>
          </div>
          {slotOptions && slotOptions.length > 0 && (
            <div className='flex items-center gap-4px flex-wrap pt-2px'>
              {slotOptions.map((slot) => {
                const isSelectedSlot = scope === 'slots' && selectedSlotId === slot.slot_id;
                return (
                  <button
                    key={slot.slot_id}
                    type='button'
                    data-testid={`model-picker-scope-slot-${slot.slot_id}`}
                    onClick={() => {
                      setScope('slots');
                      setSelectedSlotId(slot.slot_id);
                    }}
                    className={classNames(
                      'px-8px py-2px rounded-full text-11px border border-solid outline-none cursor-pointer transition-colors max-w-140px truncate',
                      isSelectedSlot
                        ? 'border-[#165DFF] bg-[#165DFF]/12 text-[#165DFF] font-600'
                        : 'border-b-base bg-2 text-t-tertiary hover:text-t-primary'
                    )}
                  >
                    {slot.isLeader ? '👑 ' : ''}
                    {slot.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Optional Force Interrupt Toggle for live running teams */}
      {showForceInterrupt && (
        <div className='flex items-center justify-between gap-10px px-10px py-7px rounded-8px bg-2 border border-solid border-b-base'>
          <div className='flex flex-col min-w-0 flex-1'>
            <span className='text-11px font-600 text-t-primary'>
              {t('team.modelHub.forceInterruptLabel', { defaultValue: 'Interrupt & Swap Immediately' })}
            </span>
            <span className='text-10px text-t-tertiary leading-14px'>
              {t('team.modelHub.forceInterruptDesc', {
                defaultValue: 'Cancel active turn and hot-swap now instead of queuing after turn',
              })}
            </span>
          </div>
          <div className='shrink-0 flex items-center'>
            <Switch
              size='small'
              className='shrink-0'
              data-testid='model-picker-force-interrupt-switch'
              checked={forceInterrupt}
              onChange={setForceInterrupt}
            />
          </div>
        </div>
      )}

      {/* IME-Safe Search Filter */}
      <div className='flex items-center gap-6px px-10px h-32px rounded-8px bg-2 border border-solid border-b-base'>
        <Search theme='outline' size='13' fill='currentColor' className='text-t-tertiary shrink-0' />
        <input
          type='text'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          {...compositionHandlers}
          onKeyDown={handleSearchKeyDown}
          placeholder={t('team.modelHub.searchModelsPlaceholder', {
            defaultValue: 'Search CLI or API models...',
          })}
          data-testid='connected-model-search-input'
          className='flex-1 min-w-0 bg-transparent border-0 outline-none text-12px text-t-primary p-0'
        />
      </div>

      {/* Clear override option */}
      {allowClearOverride && (
        <button
          type='button'
          data-testid='connected-model-clear-override'
          onClick={onClear}
          className='w-full px-8px py-5px rd-6px text-11px text-t-secondary hover:bg-fill-2 bg-transparent border border-dashed border-arco-2 cursor-pointer text-left'
        >
          ↺ {t('team.modelHub.useAssistantDefault', { defaultValue: 'Use assistant default model' })}
        </button>
      )}

      {/* Grouped Connected Models List */}
      <div className='max-h-250px overflow-y-auto flex flex-col gap-8px pe-2px'>
        {isLoading && visibleFlatItems.length === 0 ? (
          <div className='py-20px flex items-center justify-center'>
            <Spin size={18} />
          </div>
        ) : visibleFlatItems.length === 0 ? (
          <div className='py-12px'>
            <Empty
              description={t('team.modelHub.noConnectedModels', {
                defaultValue: 'No connected CLI or API models found',
              })}
            />
          </div>
        ) : (
          <>
            {renderGroupSection(
              t('team.modelHub.cliSubscriptionGroup', { defaultValue: '$0 CLI Subscription (OAuth)' }),
              filteredCliGroups,
              true
            )}
            {renderGroupSection(
              t('team.modelHub.paidApiGroup', { defaultValue: 'Connected API Providers' }),
              filteredApiGroups,
              false
            )}
          </>
        )}
      </div>
    </div>
  );
};

export const ConnectedModelPickerPopover: React.FC<ConnectedModelPickerPopoverProps> = ({
  children,
  disabled = false,
  selectedTarget,
  allowClearOverride = false,
  onClearOverride,
  showScopeSelector = false,
  defaultScope = 'all',
  slotOptions,
  showForceInterrupt = false,
  defaultForceInterrupt = false,
  teamOptions,
  selectedTeamId,
  onSelectTeamId,
  panelTestId,
  position = 'br',
  onSelectModel,
  onApplyPreset,
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <Trigger
      popupVisible={visible}
      onVisibleChange={(next) => setVisible(disabled ? false : next)}
      trigger='click'
      position={position}
      popupAlign={{ bottom: 6, top: 6 }}
      getPopupContainer={() => document.body}
      unmountOnExit
      popup={() => (
        <ConnectedModelPickerPanel
          selectedTarget={selectedTarget}
          allowClearOverride={allowClearOverride}
          onClearOverride={onClearOverride}
          showScopeSelector={showScopeSelector}
          defaultScope={defaultScope}
          slotOptions={slotOptions}
          showForceInterrupt={showForceInterrupt}
          defaultForceInterrupt={defaultForceInterrupt}
          teamOptions={teamOptions}
          selectedTeamId={selectedTeamId}
          onSelectTeamId={onSelectTeamId}
          panelTestId={panelTestId}
          onPick={(target, meta) => {
            setVisible(false);
            void onSelectModel(target, meta);
          }}
          onApplyPreset={
            onApplyPreset
              ? (preset, forceInterrupt) => {
                  setVisible(false);
                  void onApplyPreset(preset, forceInterrupt);
                }
              : undefined
          }
          onClear={() => {
            setVisible(false);
            onClearOverride?.();
          }}
        />
      )}
    >
      {children}
    </Trigger>
  );
};

export default ConnectedModelPickerPopover;
