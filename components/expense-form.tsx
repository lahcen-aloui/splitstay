"use client";
import { useRef, useState, type FormEvent } from "react";
import { en } from "@/locales/en";
import { decodeGroup, parseEuroCents, type Expense, type Group } from "@/lib/group";
interface Props { group: Group; disabled: boolean; onAdd: (expense: Expense) => Promise<boolean> }
export function ExpenseForm({ group, disabled, onAdd }: Props) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [payerId, setPayerId] = useState("");
  const [excluded, setExcluded] = useState<string[]>([]);
  const draftId = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actualPayer = group.participants.some(participant => participant.id === payerId) ? payerId : group.participants[0]?.id ?? "";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const amountCents = parseEuroCents(amount);
    const participantIds = group.participants.filter(participant => !excluded.includes(participant.id)).map(participant => participant.id);
    if (!description.trim() || description.trim().length > 120 || amountCents === null || !actualPayer || participantIds.length === 0) { setError(en.expense.invalid); return; }
    const expense: Expense = { id: draftId.current ?? crypto.randomUUID(), description: description.trim(), amountCents, payerId: actualPayer, participantIds };
    if (!decodeGroup({ ...group, expenses: [...group.expenses.filter(item => item.id !== expense.id), expense] })) { setError(en.expense.unsafe); return; }
    draftId.current = expense.id;
    if (!await onAdd(expense)) return;
    draftId.current = null;
    setDescription(""); setAmount(""); setExcluded([]); setError(null);
  }
  return <section className="form-panel" aria-labelledby="expense-title"><h2 id="expense-title">{en.expense.title}</h2><form onSubmit={event => { void submit(event); }} noValidate>
    <fieldset disabled={disabled || group.participants.length === 0} className="form-fields">
      <label>{en.expense.description}<input value={description} maxLength={120} placeholder={en.expense.descriptionPlaceholder} onChange={event => setDescription(event.target.value)} /></label>
      <div className="form-pair"><label>{en.expense.amount}<input value={amount} inputMode="decimal" placeholder={en.expense.amountPlaceholder} onChange={event => setAmount(event.target.value)} /></label><label>{en.expense.payer}<select aria-label={en.expense.payer} value={actualPayer} onChange={event => setPayerId(event.target.value)}>{group.participants.map(participant => <option key={participant.id} value={participant.id}>{participant.name}</option>)}</select></label></div>
      <fieldset className="split-field"><legend>{en.expense.split}</legend><p>{en.expense.splitHint}</p><div className="choices">{group.participants.map(participant => <label key={participant.id}><input type="checkbox" checked={!excluded.includes(participant.id)} onChange={event => setExcluded(event.target.checked ? excluded.filter(id => id !== participant.id) : [...excluded, participant.id])} />{participant.name}</label>)}</div></fieldset>
      {error && <p role="alert" className="form-error">{error}</p>}<button type="submit">{en.expense.add}</button>
    </fieldset>
  </form></section>;
}
