import { formatEuro, splitCents, type Group } from "@/lib/group";
import { en } from "@/locales/en";
interface Props { group: Group; disabled: boolean; onRemove: (id: string) => void }
export function ExpenseLedger({ group, disabled, onRemove }: Props) {
  const name = (id: string) => group.participants.find(participant => participant.id === id)?.name ?? id;
  return <section className="ledger" aria-labelledby="ledger-title"><div className="section-heading"><h2 id="ledger-title">{en.expense.list}</h2><span>{group.expenses.length} {en.expense.count}</span></div>{group.expenses.length === 0 && <p className="empty">{en.expense.empty}</p>}<ul>{group.expenses.map(expense => {
    const shares = splitCents(expense.amountCents, group.participants.filter(participant => expense.participantIds.includes(participant.id)).map(participant => participant.id));
    return <li key={expense.id}><div className="expense-row"><div><h3>{expense.description}</h3><p>{en.expense.paidBy} {name(expense.payerId)}</p></div><strong className="money">{formatEuro(expense.amountCents)}</strong></div><div className="expense-footer"><details><summary>{en.expense.shares}</summary><ul>{Object.entries(shares).map(([id, amount]) => <li key={id}><span>{name(id)}</span><span>{formatEuro(amount)}</span></li>)}</ul></details><button className="text-button" disabled={disabled} type="button" aria-label={`${en.expense.removeLabel} ${expense.description}`} onClick={() => onRemove(expense.id)}>{en.group.remove}</button></div></li>;
  })}</ul></section>;
}
