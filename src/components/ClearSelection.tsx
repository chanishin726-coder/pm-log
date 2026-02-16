'use client';

import { useEffect } from 'react';

/**
 * 클릭/터치 시 입력 필드가 아닌 곳이면 텍스트 선택을 해제합니다.
 * 드래그로 선택 후 다른 곳을 눌러도 선택이 유지되는 현상을 방지합니다.
 */
export function ClearSelection() {
  useEffect(() => {
    const clearIfNotInput = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (!target || !document.body.contains(target)) return;
      const el = target as HTMLElement;
      const tag = el.tagName?.toLowerCase();
      const isInput =
        tag === 'input' ||
        tag === 'textarea' ||
        el.getAttribute?.('contenteditable') === 'true';
      if (!isInput) {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
          sel.removeAllRanges();
        }
      }
    };

    document.addEventListener('mousedown', clearIfNotInput, true);
    document.addEventListener('touchend', clearIfNotInput, true);
    return () => {
      document.removeEventListener('mousedown', clearIfNotInput, true);
      document.removeEventListener('touchend', clearIfNotInput, true);
    };
  }, []);

  return null;
}
