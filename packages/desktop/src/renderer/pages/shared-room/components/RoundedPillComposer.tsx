import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from '@arco-design/web-react';
import { Up, Close, Lightning, Paperclip } from '@icon-park/react';
import classNames from 'classnames';
import { useCompositionInput } from '@renderer/hooks/chat/useCompositionInput';
import type { ISharedRoomMember, ISharedRoomMessage } from '@/common/types/sharedRoom';

export interface RoundedPillComposerProps {
  roomId: string;
  roomName: string;
  members: ISharedRoomMember[];
  activeWorktree?: string;
  isAgentRunning?: boolean;
  sending?: boolean;
  replyToMsg?: ISharedRoomMessage | null;
  onClearReply?: () => void;
  onSendMessage: (payload: {
    content: string;
    files: string[];
    wokenTargets: string[];
    liveSteering: boolean;
  }) => Promise<void>;
  onSelectFiles?: () => Promise<string[] | void>;
}

export const RoundedPillComposer: React.FC<RoundedPillComposerProps> = ({
  roomId,
  roomName,
  members,
  activeWorktree = 'wt/auth-fix',
  isAgentRunning = false,
  sending = false,
  replyToMsg,
  onClearReply,
  onSendMessage,
  onSelectFiles,
}) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [liveSteering, setLiveSteering] = useState(true);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [wokenTargets, setWokenTargets] = useState<string[]>(() =>
    members.map((m) => m.team_name)
  );

  // Sync members into wokenTargets when members update
  useEffect(() => {
    setWokenTargets(members.map((m) => m.team_name));
  }, [members]);

  const { compositionHandlers, createKeyDownHandler } = useCompositionInput();

  const handleRemoveTarget = (targetName: string) => {
    setWokenTargets((prev) => prev.filter((name) => name !== targetName));
  };

  const handleAddBackTarget = (targetName: string) => {
    setWokenTargets((prev) => (prev.includes(targetName) ? prev : [...prev, targetName]));
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    try {
      await onSendMessage({
        content: trimmed,
        files: attachedFiles,
        wokenTargets,
        liveSteering,
      });
      setText('');
      setAttachedFiles([]);
      onClearReply?.();
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handlePickFiles = async () => {
    if (onSelectFiles) {
      const files = await onSelectFiles();
      if (Array.isArray(files) && files.length > 0) {
        setAttachedFiles((prev) => [...prev, ...files]);
      }
    }
  };

  return (
    <div
      data-testid='rounded-pill-composer'
      className='w-full max-w-960px mx-auto p-12px flex flex-col gap-6px box-border'
    >
      {/* Reply-to Bar */}
      {replyToMsg && (
        <div className='flex items-center justify-between px-12px py-4px rd-8px bg-fill-2 text-11px text-t-secondary'>
          <span className='truncate'>
            {t('team.sharedRoom.replyPreviewPrefix', 'Replying to {{sender}}:', {
              sender: replyToMsg.sender_label,
            })}{' '}
            <strong className='text-t-primary'>{replyToMsg.content.slice(0, 60)}</strong>
          </span>
          <button
            type='button'
            onClick={onClearReply}
            className='border-0 bg-transparent text-t-tertiary hover:text-t-primary cursor-pointer'
          >
            <Close size='12' />
          </button>
        </div>
      )}

      {/* Signature Pill Container */}
      <div
        className={classNames(
          'border border-solid border-arco-2 rd-18px bg-fill-2 p-12px transition-all flex flex-col gap-8px focus-within:border-[rgb(var(--primary-6))] focus-within:bg-bg-1 focus-within:shadow-md'
        )}
        style={{ borderRadius: '18px' }}
      >
        {/* 1. Interactive Wake Chips Strip */}
        <div
          data-testid='wake-chips-strip'
          className='flex items-center gap-6px flex-wrap text-11px'
        >
          <span className='text-t-tertiary font-medium flex items-center gap-2px select-none'>
            <Lightning theme='filled' size='12' className='text-yellow-500' />
            {t('team.sharedRoom.composer.wakeLabel', '⚡ Will wake:')}
          </span>

          {wokenTargets.map((target) => (
            <span
              key={target}
              data-testid={`wake-chip-${target}`}
              className='inline-flex items-center gap-4px px-8px py-2px rd-full bg-[rgb(var(--primary-1))] text-[rgb(var(--primary-6))] font-medium text-11px select-none'
            >
              <span>@{target}</span>
              <button
                type='button'
                aria-label={`Mute ${target}`}
                data-testid={`mute-chip-${target}`}
                onClick={() => handleRemoveTarget(target)}
                className='border-0 bg-transparent text-[rgb(var(--primary-6))] hover:text-red-500 cursor-pointer p-0 leading-none flex items-center'
              >
                ×
              </button>
            </span>
          ))}

          {wokenTargets.length === 0 && (
            <span className='text-t-tertiary italic text-11px'>
              {t('team.sharedRoom.composer.noWakeAgents', 'General note (no agents woken)')}
            </span>
          )}

          {/* Quick add back muted members */}
          {members
            .filter((m) => !wokenTargets.includes(m.team_name))
            .map((m) => (
              <button
                key={m.team_id}
                type='button'
                onClick={() => handleAddBackTarget(m.team_name)}
                className='border border-dashed border-arco-2 bg-transparent rd-full px-6px py-1px text-10px text-t-tertiary hover:text-[rgb(var(--primary-6))] hover:border-[rgb(var(--primary-6))] cursor-pointer'
              >
                +@{m.team_name}
              </button>
            ))}

          {/* Worktree Chip */}
          {activeWorktree && (
            <span
              data-testid='worktree-pill-chip'
              className='ms-auto inline-flex items-center gap-4px px-8px py-2px rd-full font-mono text-10px bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
            >
              🌿 {activeWorktree}
            </span>
          )}
        </div>

        {/* 2. Textarea with Vietnamese IME Telex/VNI Protection */}
        <textarea
          data-testid='rounded-pill-input'
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          {...compositionHandlers}
          onKeyDown={createKeyDownHandler(handleSend)}
          placeholder={t(
            'team.sharedRoom.composerPlaceholder',
            'Enter instructions for Leaders... (@team-name to mention, Enter to send, Shift+Enter for new line)'
          )}
          className='w-full border-0 bg-transparent text-13px text-t-primary focus:outline-none resize-none font-sans leading-relaxed'
        />

        {/* Attached Files Preview */}
        {attachedFiles.length > 0 && (
          <div className='flex items-center gap-6px flex-wrap text-11px'>
            {attachedFiles.map((file, idx) => (
              <span
                key={idx}
                className='px-6px py-2px rd-4px bg-fill-3 text-t-primary font-mono text-10px flex items-center gap-4px'
              >
                <span>📎 {file.split(/[/\\]/).pop()}</span>
                <button
                  type='button'
                  onClick={() =>
                    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className='border-0 bg-transparent text-t-tertiary hover:text-red-500 cursor-pointer p-0'
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* 3. Footer with Live Steering Toggle & Circular Send Button */}
        <div className='flex items-center justify-between pt-4px'>
          <div className='flex items-center gap-8px'>
            <Tooltip
              content={t('team.sharedRoom.attachFileTooltip', 'Attach files to Shared Artifacts repository & team shared inboxes')}
              position='top'
            >
              <Button
                size='small'
                type='text'
                icon={<Paperclip />}
                onClick={handlePickFiles}
                className='text-t-secondary'
              />
            </Tooltip>

            {/* Live Steering Switch */}
            <button
              type='button'
              data-testid='live-steering-toggle'
              onClick={() => setLiveSteering((prev) => !prev)}
              className={classNames(
                'border-0 px-8px py-3px rd-6px text-11px font-medium flex items-center gap-4px cursor-pointer transition-all',
                liveSteering
                  ? 'bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300 font-bold'
                  : 'bg-fill-3 text-t-tertiary'
              )}
            >
              <Lightning theme={liveSteering ? 'filled' : 'outline'} size='12' />
              <span>
                {liveSteering
                  ? t('team.sharedRoom.composer.liveSteeringOn', '⚡ Live steering: Active')
                  : t('team.sharedRoom.composer.liveSteeringOff', '⚡ Live steering: Off')}
              </span>
            </button>
          </div>

          {/* Send Circle Button */}
          <button
            type='button'
            aria-label='Send message'
            data-testid='send-circle-btn'
            disabled={!text.trim() || sending}
            onClick={handleSend}
            className={classNames(
              'size-30px rounded-full border-0 flex items-center justify-center cursor-pointer transition-all shadow-sm',
              text.trim() && !sending
                ? 'bg-[rgb(var(--primary-6))] text-white hover:opacity-90 active:scale-95'
                : 'bg-fill-3 text-t-tertiary cursor-not-allowed opacity-60'
            )}
          >
            <Up theme='outline' size='16' fill='currentColor' />
          </button>
        </div>
      </div>
    </div>
  );
};
