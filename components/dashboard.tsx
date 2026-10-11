"use client";
import { useState } from "react";
import Link from "next/link";
import { canRemoveParticipant, decodeGroup, formatEuro, sampleGroup, type Group } from "@/lib/group";
import { useLocalStore } from "@/lib/use-local-store";
import { en } from "@/locales/en";
import { Confirmation } from "./confirmation";
import { ExpenseForm } from "./expense-form";
import { ParticipantPanel } from "./participant-panel";
import { ExpenseLedger } from "./expense-ledger";
import { BalancePanel } from "./balance-panel";
export const storageKey = "splitstay.group.v1";
type ConfirmationState = ({ kind: "reset" } | { kind: "expense" | "participant"; id: string }) & { baseline: string | null | undefined };
const emptyGroup: Group = { version: 1, participants: [], expenses: [] };
export function Dashboard() {
  const store = useLocalStore(storageKey, decodeGroup, sampleGroup, emptyGroup, true);
  const { value: group, ready, blocked, error, busy } = store;
  const [resetKey, setResetKey] = useState(0);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  async function persist(next: Group): Promise<boolean> {
    if (blocked || !ready) return false;
    return store.save(next);
  }
  async function confirm() {
    if (!confirmation) return;
    const success = confirmation.kind === "reset" ? await store.save(sampleGroup(), true, confirmation.baseline) : confirmation.kind === "expense" ? await persist({ ...group, expenses: group.expenses.filter(expense => expense.id !== confirmation.id) }) : canRemoveParticipant(group, confirmation.id) && await persist({ ...group, participants: group.participants.filter(participant => participant.id !== confirmation.id) });
    if (!success) return;
    if (confirmation.kind === "reset") setResetKey(key => key + 1);
    setConfirmation(null);
  }
  async function loadLatest() {
    if (await store.load()) { setResetKey(key => key + 1); setConfirmation(null); }
  }
  const copy = confirmation?.kind === "expense" ? { title: en.expense.removeTitle, description: en.expense.removeBody, action: en.expense.confirmRemove } : confirmation?.kind === "participant" ? { title: en.group.removeTitle, description: en.group.removeBody, action: en.group.confirmRemove } : { title: en.group.resetTitle, description: en.group.resetBody, action: en.group.confirmReset };
  const disabled = blocked || !ready || busy;
  const total = group.expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const hasSamples = group.expenses.some(expense => ["apartment", "dinner", "groceries"].includes(expense.id));
  return <div className="workspace"><header><Link href="/" className="brand">{en.app.name}<span aria-hidden="true" className="brand-mark">÷</span></Link><span className="local-status">{!ready ? en.app.loading : error ? en.common.euro : en.storage.saved}</span></header><main><div className="page-heading"><div><h1>{en.app.heading}</h1><p>{en.app.intro}</p></div><button className="secondary" type="button" disabled={!ready || busy} onClick={() => setConfirmation({ kind: "reset", baseline: store.baseline() })}>{en.group.reset}</button></div><div className="trip-summary"><span>{hasSamples ? en.app.demo : en.common.euro}</span><div><span>{en.expense.total}</span><strong className="money">{formatEuro(total)}</strong></div></div>
    {error && <div role="alert" className="error-box"><p>{error}</p>{blocked && <p>{en.storage.blocked}</p>}<button className="secondary" type="button" disabled={busy} onClick={() => { if (blocked) void loadLatest(); else void store.retry(); }}>{blocked ? en.storage.loadLatest : en.storage.retry}</button></div>}
    {!ready ? <p role="status">{en.app.loading}</p> : <div className="workspace-grid"><div className="left-column"><ExpenseForm key={`expense-${resetKey}`} group={group} disabled={disabled} onAdd={expense => persist({ ...group, expenses: [...group.expenses.filter(item => item.id !== expense.id), expense] })} /><ParticipantPanel key={`participant-${resetKey}`} group={group} disabled={disabled} onAdd={participant => persist({ ...group, participants: [...group.participants.filter(item => item.id !== participant.id), participant] })} onRemove={id => setConfirmation({ kind: "participant", id, baseline: store.baseline() })} /></div><ExpenseLedger group={group} disabled={disabled} onRemove={id => setConfirmation({ kind: "expense", id, baseline: store.baseline() })} /><BalancePanel group={group} /></div>}<footer>{en.app.local}</footer></main>{confirmation && <Confirmation {...copy} busy={busy} onClose={() => setConfirmation(null)} onConfirm={() => { void confirm(); }} />}</div>;
}
