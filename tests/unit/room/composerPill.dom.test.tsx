import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RoundedPillComposer } from '@/renderer/pages/shared-room/components/RoundedPillComposer';
import type { ISharedRoomMember } from '@/common/types/sharedRoom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string | Record<string, any>, params?: Record<string, any>) => {
      let str = typeof defaultValue === 'string' ? defaultValue : key;
      const values = typeof defaultValue === 'object' ? defaultValue : params;
      if (values) {
        for (const [k, v] of Object.entries(values)) {
          str = str.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
        }
      }
      return str;
    },
    i18n: { language: 'en-US' },
  }),
}));

const mockMembers: ISharedRoomMember[] = [
  {
    team_id: 'team-be',
    team_name: 'Backend Lead',
    leader_name: 'BE Lead',
    is_host: true,
  },
  {
    team_id: 'team-fe',
    team_name: 'Frontend Lead',
    leader_name: 'FE Lead',
    is_host: false,
  },
];

describe('F20: Rounded Pill Composer with Wake Chips, Telex IME, Live Steering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders signature pill container with rd-18px styling and worktree chip', () => {
    const handleSend = vi.fn();
    render(
      <RoundedPillComposer
        roomId='room-1'
        roomName='auth-fix'
        members={mockMembers}
        activeWorktree='wt/auth-fix'
        onSendMessage={handleSend}
      />
    );

    const composer = screen.getByTestId('rounded-pill-composer');
    expect(composer).toBeInTheDocument();

    const wtChip = screen.getByTestId('worktree-pill-chip');
    expect(wtChip).toBeInTheDocument();
    expect(wtChip).toHaveTextContent('🌿 wt/auth-fix');
  });

  it('defaults to Chair-only wake target and handles Wake All / muting / adding back targets', () => {
    const handleSend = vi.fn();
    render(
      <RoundedPillComposer
        roomId='room-1'
        roomName='auth-fix'
        members={mockMembers}
        onSendMessage={handleSend}
      />
    );

    // Default wakes Chair only (1/2)
    expect(screen.getByTestId('wake-count-badge')).toHaveTextContent('1/2');
    expect(screen.getByTestId('wake-chip-Backend Lead')).toBeInTheDocument();
    expect(screen.queryByTestId('wake-chip-Frontend Lead')).not.toBeInTheDocument();

    // Wake All (2) activates all leaders
    fireEvent.click(screen.getByTestId('wake-all-btn'));
    expect(screen.getByTestId('wake-count-badge')).toHaveTextContent('2/2');
    expect(screen.getByTestId('wake-chip-Frontend Lead')).toBeInTheDocument();

    // Mute Frontend Lead
    const muteFeBtn = screen.getByTestId('mute-chip-Frontend Lead');
    fireEvent.click(muteFeBtn);

    expect(screen.queryByTestId('wake-chip-Frontend Lead')).not.toBeInTheDocument();
    expect(screen.getByTestId('wake-chip-Backend Lead')).toBeInTheDocument();

    // Add back Frontend Lead
    const addBackBtn = screen.getByRole('button', { name: '+@Frontend Lead' });
    expect(addBackBtn).toBeInTheDocument();
    fireEvent.click(addBackBtn);

    expect(screen.getByTestId('wake-chip-Frontend Lead')).toBeInTheDocument();
  });

  it('auto-routes wake chips deterministically from @mentions and @all', () => {
    const handleSend = vi.fn();
    render(
      <RoundedPillComposer
        roomId='room-1'
        roomName='auth-fix'
        members={mockMembers}
        onSendMessage={handleSend}
      />
    );

    const input = screen.getByTestId('rounded-pill-input');
    fireEvent.change(input, { target: { value: 'Hey @frontend-lead please review' } });
    expect(screen.getByTestId('wake-chip-Frontend Lead')).toBeInTheDocument();
    expect(screen.queryByTestId('wake-chip-Backend Lead')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Syncing @all on release' } });
    expect(screen.getByTestId('wake-chip-Backend Lead')).toBeInTheDocument();
    expect(screen.getByTestId('wake-chip-Frontend Lead')).toBeInTheDocument();

    // Clearing @mention reverts cleanly to Chair-only default
    fireEvent.change(input, { target: { value: 'Plain question for chair' } });
    expect(screen.getByTestId('wake-chip-Backend Lead')).toBeInTheDocument();
    expect(screen.queryByTestId('wake-chip-Frontend Lead')).not.toBeInTheDocument();
  });

  it('displays fallback when all wake targets are muted', () => {
    const handleSend = vi.fn();
    render(
      <RoundedPillComposer
        roomId='room-1'
        roomName='auth-fix'
        members={mockMembers}
        onSendMessage={handleSend}
      />
    );

    fireEvent.click(screen.getByTestId('mute-chip-Backend Lead'));

    expect(screen.getByText('General note (no agents woken)')).toBeInTheDocument();
  });

  it('toggles live steering mode', () => {
    const handleSend = vi.fn();
    render(
      <RoundedPillComposer
        roomId='room-1'
        roomName='auth-fix'
        members={mockMembers}
        onSendMessage={handleSend}
      />
    );

    const toggle = screen.getByTestId('live-steering-toggle');
    expect(toggle).toHaveTextContent('Live steering: Active');

    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('Live steering: Off');
  });

  it('protects Vietnamese IME during composition and sends on Enter when not composing', async () => {
    const handleSend = vi.fn().mockResolvedValue(undefined);
    render(
      <RoundedPillComposer
        roomId='room-1'
        roomName='auth-fix'
        members={mockMembers}
        onSendMessage={handleSend}
      />
    );

    const input = screen.getByTestId('rounded-pill-input');
    const sendBtn = screen.getByTestId('send-circle-btn');

    // Button disabled initially
    expect(sendBtn).toBeDisabled();

    // Type text
    fireEvent.change(input, { target: { value: 'Sửa lỗi refresh token tiếng Việt' } });
    expect(sendBtn).not.toBeDisabled();

    // Start IME composition (e.g., typing diacritics in Telex/VNI)
    fireEvent.compositionStart(input);

    // Enter pressed during composition should NOT send
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(handleSend).not.toHaveBeenCalled();

    // End IME composition (safari/chromium debounce guard requires >60ms)
    fireEvent.compositionEnd(input);
    await new Promise((r) => setTimeout(r, 80));

    // Enter pressed after composition should send
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    await waitFor(() => {
      expect(handleSend).toHaveBeenCalledTimes(1);
    });
    expect(handleSend).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Sửa lỗi refresh token tiếng Việt',
        liveSteering: true,
        wokenTargets: ['Backend Lead'],
      })
    );
  });
});
