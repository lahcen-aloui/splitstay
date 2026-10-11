"use client";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { en } from "@/locales/en";
interface Props { title: string; description: string; action: string; onClose: () => void; onConfirm: () => void; busy?: boolean }
export function Confirmation({ title, description, action, onClose, onConfirm, busy = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    dialog?.showModal();
    cancel.current?.focus();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  function containFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
    const dialog = event.currentTarget;
    const controls = [...dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")].filter(control => control.tabIndex >= 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
    const active = document.activeElement;
    if (active === dialog || !dialog.contains(active) || (event.shiftKey ? active === first : active === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }
  return <dialog ref={ref} tabIndex={-1} aria-labelledby="confirm-title" aria-describedby="confirm-description" onKeyDown={containFocus} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <h2 id="confirm-title">{title}</h2><p id="confirm-description">{description}</p>
    <div className="actions"><button ref={cancel} className="secondary" type="button" disabled={busy} onClick={onClose}>{en.common.cancel}</button><button type="button" disabled={busy} onClick={onConfirm}>{action}</button></div>
  </dialog>;
}
