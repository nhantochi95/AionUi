/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Button, Checkbox, Message } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import type { ModelTargetSpec, QuickCreateMemberResponse } from '@/common/types/team/teamHubTypes';
import { useCompositionInput } from '@renderer/hooks/chat/useCompositionInput';
import ConnectedModelPickerPopover from './ConnectedModelPickerPopover';
import { useConnectedModelsCatalog } from './useConnectedModelsCatalog';
import { getTeamHubBridge } from './bridgeSafe';

export interface QuickCreateMemberResult {
  response: QuickCreateMemberResponse;
  target: ModelTargetSpec;
}

export interface QuickCreateMemberInlineFormProps {
  teamId?: string;
  compact?: boolean;
  onCreated: (result: QuickCreateMemberResult) => void | Promise<void>;
  onCancel: () => void;
}

export const QuickCreateMemberInlineForm: React.FC<QuickCreateMemberInlineFormProps> = ({
  teamId,
  compact = false,
  onCreated,
  onCancel,
}) => {
  const { t } = useTranslation();
  const { allItems } = useConnectedModelsCatalog(true);

  const nameComposition = useCompositionInput();
  const promptComposition = useCompositionInput();

  const [memberName, setMemberName] = useState('');
  const [rolePrompt, setRolePrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelTargetSpec | undefined>(undefined);
  const [saveToCatalog, setSaveToCatalog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Default to the first connected model once catalog loads
  useEffect(() => {
    if (!selectedModel && allItems.length > 0) {
      setSelectedModel(allItems[0].target);
    }
  }, [allItems, selectedModel]);

  const effectiveTarget: ModelTargetSpec = selectedModel ?? {
    backend: 'claude',
    model_id: 'default',
    label: 'claude · default',
    wallet_type: 'cli_subscription',
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const trimmedName = memberName.trim();
    if (!trimmedName) {
      Message.warning(t('team.modelHub.memberNameRequired', { defaultValue: 'Please enter a member name' }));
      return;
    }

    const hub = getTeamHubBridge();
    if (!hub?.quickMember?.invoke) return;

    setSubmitting(true);
    try {
      const response = await hub.quickMember.invoke({
        name: trimmedName,
        role_prompt: rolePrompt.trim() || undefined,
        backend: effectiveTarget.backend,
        provider_id: effectiveTarget.provider_id,
        model_id: effectiveTarget.model_id,
        save_to_catalog: saveToCatalog,
        team_id: teamId,
      });

      const resolvedTarget: ModelTargetSpec = {
        backend: response.backend || effectiveTarget.backend,
        provider_id: response.provider_id ?? effectiveTarget.provider_id,
        model_id: response.model_id ?? effectiveTarget.model_id,
        label:
          effectiveTarget.label ??
          `${response.backend || effectiveTarget.backend} · ${response.model_id || 'default'}`,
        wallet_type: response.wallet_type ?? effectiveTarget.wallet_type,
      };

      await onCreated({ response, target: resolvedTarget });
      Message.success(
        t('team.modelHub.quickCreateSuccess', {
          name: response.assistant_name || trimmedName,
          defaultValue: `Added member "${response.assistant_name || trimmedName}"`,
        })
      );
    } catch (err) {
      Message.error(
        t('team.modelHub.quickCreateFailed', {
          error: String(err),
          defaultValue: `Failed to create member: ${String(err)}`,
        })
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleNameKeyDown = nameComposition.createKeyDownHandler(() => {
    void handleSubmit();
  });

  const handlePromptKeyDown = promptComposition.createKeyDownHandler(() => {
    void handleSubmit();
  });

  return (
    <div
      data-testid='quick-create-member-form'
      className={classNames(
        'flex flex-col gap-8px rd-8px border border-solid border-arco-2 bg-fill-1 text-t-primary',
        compact ? 'p-8px mb-8px' : 'p-10px mb-10px'
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className='text-12px font-600 text-t-primary'>
        {t('team.modelHub.quickCreateTitle', { defaultValue: 'Quick Create Team Member' })}
      </div>

      {/* Member Name (IME-protected) */}
      <div className='flex flex-col gap-3px'>
        <label className='text-11px font-500 text-t-secondary'>
          {t('team.modelHub.memberNameLabel', { defaultValue: 'Member Name' })}{' '}
          <span className='text-danger-6'>*</span>
        </label>
        <input
          type='text'
          value={memberName}
          onChange={(e) => setMemberName(e.target.value)}
          {...nameComposition.compositionHandlers}
          onKeyDown={handleNameKeyDown}
          placeholder={t('team.modelHub.memberNamePlaceholder', {
            defaultValue: 'e.g. Rust Architect, QA Challenger...',
          })}
          data-testid='quick-member-name-input'
          className='h-30px px-8px rd-6px bg-bg-1 border border-solid border-arco-2 outline-none text-12px text-t-primary'
        />
      </div>

      {/* Role / System Prompt (Optional, IME-protected) */}
      <div className='flex flex-col gap-3px'>
        <label className='text-11px font-500 text-t-secondary'>
          {t('team.modelHub.rolePromptLabel', { defaultValue: 'Role / System Prompt (Optional)' })}
        </label>
        <textarea
          rows={2}
          value={rolePrompt}
          onChange={(e) => setRolePrompt(e.target.value)}
          {...promptComposition.compositionHandlers}
          onKeyDown={handlePromptKeyDown}
          placeholder={t('team.modelHub.rolePromptPlaceholder', {
            defaultValue: 'Describe responsibilities, constraints, or persona...',
          })}
          data-testid='quick-member-prompt-input'
          className='px-8px py-5px rd-6px bg-bg-1 border border-solid border-arco-2 outline-none text-12px text-t-primary resize-none font-sans'
        />
      </div>

      {/* Connected Model Picker */}
      <div className='flex flex-col gap-3px'>
        <span className='text-11px font-500 text-t-secondary'>
          {t('team.modelHub.connectedModelLabel', { defaultValue: 'Connected Model' })}
        </span>
        <ConnectedModelPickerPopover
          selectedTarget={effectiveTarget}
          position='bl'
          panelTestId='quick-member-model-picker-panel'
          onSelectModel={(target) => setSelectedModel(target)}
        >
          <button
            type='button'
            data-testid='quick-member-model-trigger'
            className='h-30px px-8px rd-6px bg-bg-1 hover:bg-fill-2 border border-solid border-arco-2 flex items-center justify-between gap-6px text-12px text-t-primary cursor-pointer'
          >
            <span className='truncate'>
              {effectiveTarget.label ||
                `${effectiveTarget.backend} · ${effectiveTarget.model_id || t('team.modelHub.defaultModel', { defaultValue: 'Default' })}`}
            </span>
            <span className='shrink-0 flex items-center gap-4px'>
              <span
                className={classNames(
                  'px-5px py-0.5px rd-999px text-10px font-600',
                  effectiveTarget.wallet_type === 'api_key'
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                )}
              >
                {effectiveTarget.wallet_type === 'api_key'
                  ? t('team.modelHub.apiBadge', { defaultValue: 'API' })
                  : t('team.modelHub.cliBadge', { defaultValue: '$0 CLI' })}
              </span>
              <Down theme='outline' size='13' fill='currentColor' />
            </span>
          </button>
        </ConnectedModelPickerPopover>
      </div>

      {/* Save to Assistants Catalog Checkbox */}
      <label className='inline-flex items-center gap-6px cursor-pointer select-none text-11px text-t-secondary'>
        <Checkbox
          checked={saveToCatalog}
          onChange={setSaveToCatalog}
          data-testid='quick-member-save-catalog-checkbox'
        />
        <span>
          {t('team.modelHub.saveToCatalogLabel', { defaultValue: 'Save to Assistants catalog' })}
        </span>
      </label>

      {/* Actions */}
      <div className='flex items-center justify-end gap-6px pt-2px'>
        <Button
          size='mini'
          data-testid='quick-member-cancel-btn'
          disabled={submitting}
          onClick={onCancel}
        >
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button
          size='mini'
          type='primary'
          data-testid='quick-member-submit-btn'
          loading={submitting}
          disabled={!memberName.trim()}
          onClick={() => void handleSubmit()}
        >
          {t('team.modelHub.createMemberConfirm', { defaultValue: 'Add Member' })}
        </Button>
      </div>
    </div>
  );
};

export default QuickCreateMemberInlineForm;
