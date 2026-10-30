"use client";
import { useEffect, useRef } from "react";
export function useDialogFocus(isOpen: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!isOpen || !ref.current) return;
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')).filter(node => node.getClientRects().length);
    dialog.tabIndex = -1;
    (focusable()[0] || dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      const dialogs = Array.from(document.querySelectorAll('[aria-modal="true"]'));
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key === "Tab") {
        const nodes = focusable(), first = nodes[0] || dialog, last = nodes[nodes.length - 1] || dialog;
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    const focusin = (event: FocusEvent) => {
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      if (dialogs[dialogs.length - 1] === dialog && !dialog.contains(event.target as Node)) (focusable()[0] || dialog).focus();
    };
    document.addEventListener("keydown", keydown, true); document.addEventListener("focusin", focusin);
    return () => { document.removeEventListener("keydown", keydown, true); document.removeEventListener("focusin", focusin); if (previous?.isConnected) previous.focus(); };
  }, [isOpen]);
  return ref;
}
