/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Checkbox, Input, InputNumber, Message, Modal, Select, Tag } from '@arco-design/web-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { ISharedRoom } from '@/common/types/sharedRoom';
import { useTeamList } from '@renderer/pages/team/hooks/useTeamList';

interface SharedRoomFormModalProps {
  visible: boolean;
  mode: 'create' | 'edit';
  initialRoom?: ISharedRoom | null;
  onClose: () => void;
  onSaved: (room: ISharedRoom) => void;
}

const SharedRoomFormModal: React.FC<SharedRoomFormModalProps> = ({ visible, mode, initialRoom, onClose, onSaved }) => {
  const { t } = useTranslation();
  const { teams } = useTeamList();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [hostTeamId, setHostTeamId] = useState<string>('');
  const [maxHops, setMaxHops] = useState<number>(5);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (mode === 'edit' && initialRoom) {
      setName(initialRoom.name);
      setDescription(initialRoom.description ?? '');
      setRules(initialRoom.rules ?? '');
      const memberIds = initialRoom.members.map((m) => m.team_id);
      setSelectedTeamIds(memberIds);
      setHostTeamId(initialRoom.host_team_id ?? memberIds[0] ?? '');
      setMaxHops(initialRoom.max_hops ?? 5);
    } else {
      setName('');
      setDescription('');
      setRules('');
      setSelectedTeamIds([]);
      setHostTeamId('');
      setMaxHops(5);
    }
  }, [initialRoom, mode, visible]);

  const selectedTeams = useMemo(() => teams.filter((team) => selectedTeamIds.includes(team.id)), [teams, selectedTeamIds]);

  useEffect(() => {
    if (selectedTeamIds.length === 0) {
      setHostTeamId('');
    } else if (!hostTeamId || !selectedTeamIds.includes(hostTeamId)) {
      setHostTeamId(selectedTeamIds[0]);
    }
  }, [hostTeamId, selectedTeamIds]);

  const toggleTeam = (teamId: string, checked: boolean) => {
    setSelectedTeamIds((prev) => {
      if (checked) {
        return prev.includes(teamId) ? prev : [...prev, teamId];
      }
      return prev.filter((id) => id !== teamId);
    });
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Message.warning(t('team.sharedRoom.form.nameRequired'));
      return;
    }
    if (selectedTeamIds.length === 0) {
      Message.warning(t('team.sharedRoom.form.memberRequired'));
      return;
    }

    setSaving(true);
    try {
      let saved: ISharedRoom;
      if (mode === 'edit' && initialRoom) {
        saved = await ipcBridge.sharedRoom.update.invoke({
          id: initialRoom.id,
          name: trimmedName,
          description: description.trim(),
          rules: rules.trim(),
          team_ids: selectedTeamIds,
          host_team_id: hostTeamId || selectedTeamIds[0],
          max_hops: maxHops,
        });
        Message.success(t('team.sharedRoom.form.updateSuccess'));
      } else {
        saved = await ipcBridge.sharedRoom.create.invoke({
          name: trimmedName,
          description: description.trim(),
          rules: rules.trim(),
          team_ids: selectedTeamIds,
          host_team_id: hostTeamId || selectedTeamIds[0],
          max_hops: maxHops,
        });
        Message.success(t('team.sharedRoom.form.createSuccess'));
      }
      onSaved(saved);
      onClose();
    } catch (err) {
      Message.error(t('team.sharedRoom.form.saveFailed', { error: String(err) }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={mode === 'edit' ? t('team.sharedRoom.form.editTitle') : t('team.sharedRoom.form.createTitle')}
      visible={visible}
      onCancel={onClose}
      style={{ width: 640, maxWidth: 'calc(100vw - 32px)' }}
      footer={
        <div className='flex items-center justify-end gap-8px'>
          <Button onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            type='primary'
            loading={saving}
            disabled={!name.trim() || selectedTeamIds.length === 0}
            data-testid='shared-room-submit-btn'
            onClick={() => void handleSubmit()}
          >
            {mode === 'edit' ? t('team.sharedRoom.form.saveChanges') : t('team.sharedRoom.form.createRoom')}
          </Button>
        </div>
      }
    >
      <div className='flex flex-col gap-14px text-t-primary'>
        <div className='text-12px text-t-secondary leading-18px bg-fill-1 rd-8px px-12px py-8px border border-solid border-arco-2'>
          {t('team.sharedRoom.form.helperDesc')}
        </div>

        <div className='flex flex-col gap-4px'>
          <span className='text-13px font-500'>
            {t('team.sharedRoom.form.nameLabel')} <span className='text-danger-6'>*</span>
          </span>
          <Input
            placeholder={t('team.sharedRoom.form.namePlaceholder')}
            value={name}
            onChange={setName}
            data-testid='shared-room-name-input'
          />
        </div>

        <div className='flex flex-col gap-4px'>
          <span className='text-13px font-500'>{t('team.sharedRoom.form.descLabel')}</span>
          <Input
            placeholder={t('team.sharedRoom.form.descPlaceholder')}
            value={description}
            onChange={setDescription}
          />
        </div>

        <div className='flex flex-col gap-6px'>
          <div className='flex items-center justify-between'>
            <span className='text-13px font-500'>
              {t('team.sharedRoom.form.selectTeamsCount', { selected: selectedTeamIds.length, total: teams.length })}{' '}
              <span className='text-danger-6'>*</span>
            </span>
            {teams.length > 1 && (
              <button
                type='button'
                className='text-12px text-primary-6 bg-transparent border-0 cursor-pointer hover:underline p-0'
                onClick={() =>
                  setSelectedTeamIds(selectedTeamIds.length === teams.length ? [] : teams.map((item) => item.id))
                }
              >
                {selectedTeamIds.length === teams.length
                  ? t('team.sharedRoom.form.deselectAll')
                  : t('team.sharedRoom.form.selectAll')}
              </button>
            )}
          </div>

          {teams.length === 0 ? (
            <div className='rd-8px border border-dashed border-arco-2 p-16px text-center text-12px text-t-tertiary'>
              {t('team.sharedRoom.form.noTeamsHint')}
            </div>
          ) : (
            <div className='max-h-180px overflow-y-auto rd-8px border border-solid border-arco-2 divide-y divide-arco-1'>
              {teams.map((tItem) => {
                const checked = selectedTeamIds.includes(tItem.id);
                const leader = tItem.assistants.find((a) => a.role === 'leader') ?? tItem.assistants[0];
                return (
                  <div
                    key={tItem.id}
                    className='flex items-center justify-between gap-10px px-12px py-8px hover:bg-fill-2 cursor-pointer transition-colors'
                    onClick={() => toggleTeam(tItem.id, !checked)}
                  >
                    <div className='flex items-center gap-10px min-w-0'>
                      <Checkbox
                        checked={checked}
                        onChange={(val) => toggleTeam(tItem.id, Boolean(val))}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className='flex flex-col min-w-0'>
                        <span className='text-13px font-500 truncate'>{tItem.name}</span>
                        <span className='text-11px text-t-tertiary truncate'>
                          {t('team.sharedRoom.form.teamMemberCountDesc', {
                            leader: leader?.assistant_name ?? 'Lead',
                            count: tItem.assistants.length,
                          })}
                        </span>
                      </div>
                    </div>
                    {hostTeamId === tItem.id && checked && (
                      <Tag size='small' color='arcoblue'>
                        {t('team.sharedRoom.form.chairTag')}
                      </Tag>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className='grid grid-cols-2 gap-12px'>
          <div className='flex flex-col gap-4px'>
            <span className='text-12px font-500 text-t-secondary'>{t('team.sharedRoom.form.chairTeamLabel')}</span>
            <Select
              placeholder={t('team.sharedRoom.form.chairTeamPlaceholder')}
              value={hostTeamId || undefined}
              disabled={selectedTeams.length === 0}
              onChange={(val) => setHostTeamId(val as string)}
            >
              {selectedTeams.map((tItem) => (
                <Select.Option key={tItem.id} value={tItem.id}>
                  {tItem.name}
                </Select.Option>
              ))}
            </Select>
            <span className='text-11px text-t-tertiary'>
              {t('team.sharedRoom.form.chairTeamDesc')}
            </span>
          </div>

          <div className='flex flex-col gap-4px'>
            <span className='text-12px font-500 text-t-secondary'>{t('team.sharedRoom.form.maxHopsLabel')}</span>
            <InputNumber
              min={1}
              max={30}
              value={maxHops}
              onChange={(val) => setMaxHops(typeof val === 'number' ? val : 5)}
            />
            <span className='text-11px text-t-tertiary'>
              {t('team.sharedRoom.form.maxHopsDesc')}
            </span>
          </div>
        </div>

        <div className='flex flex-col gap-4px'>
          <span className='text-12px font-500 text-t-secondary'>{t('team.sharedRoom.form.rulesLabel')}</span>
          <Input.TextArea
            rows={2}
            placeholder={t('team.sharedRoom.form.rulesPlaceholder')}
            value={rules}
            onChange={setRules}
          />
        </div>
      </div>
    </Modal>
  );
};

export default SharedRoomFormModal;
