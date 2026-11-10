import { useRef, useState } from 'react';

// Touch-first devices (phones, tablets) have no practical Shift+Enter on the
// on-screen keyboard, so Enter must insert a newline there; the send button sends.
// Viewport width is deliberately not used: narrow desktop windows keep Enter-to-send.
const isTouchPrimaryInput = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: none) and (pointer: coarse)').matches;

/**
 * 共享的输入法合成事件处理hook
 * 消除SendBox组件和GUID页面中的IME处理重复代码
 */
export const useCompositionInput = () => {
  const isComposing = useRef(false);
  const [isComposingState, setIsComposingState] = useState(false);
  const lastCompositionEndTime = useRef<number>(0);

  const compositionHandlers = {
    onCompositionStartCapture: () => {
      isComposing.current = true;
      setIsComposingState(true);
    },
    onCompositionEndCapture: () => {
      isComposing.current = false;
      setIsComposingState(false);
      lastCompositionEndTime.current = Date.now();
    },
  };

  const createKeyDownHandler = (onEnterPress: () => void, onKeyDownIntercept?: (e: React.KeyboardEvent) => boolean) => {
    return (e: React.KeyboardEvent) => {
      // Safari and Chromium can dispatch compositionend before the keydown that confirms
      // the IME candidate, so the ref and native flag may already be false at this point.
      if (isComposing.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
      if (Date.now() - lastCompositionEndTime.current < 60) return;
      if (onKeyDownIntercept?.(e)) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        if (isTouchPrimaryInput()) return;
        e.preventDefault();
        onEnterPress();
      }
    };
  };

  return {
    isComposing,
    isComposingState,
    compositionHandlers,
    createKeyDownHandler,
  };
};
