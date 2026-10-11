import { balances, formatEuro, settlements, type Group } from "@/lib/group";
import { en } from "@/locales/en";
export function BalancePanel({ group }: { group: Group }) {
  const net = balances(group);
  const transfers = settlements(net);
  const name = (id: string) => group.participants.find(participant => participant.id === id)?.name ?? id;
  return <section className="results" aria-labelledby="balances-title"><h2 id="balances-title">{en.result.balances}</h2><p className="explanation">{en.result.explanation}</p><div className="balances">{group.participants.map(participant => <div className={`balance ${net[participant.id] < 0 ? "owes" : "receives"}`} key={participant.id}><span>{participant.name}</span><strong className="money">{net[participant.id] > 0 ? "+" : ""}{formatEuro(net[participant.id])}</strong><small>{net[participant.id] > 0 ? en.result.receive : net[participant.id] < 0 ? en.result.owe : en.result.even}</small></div>)}</div><p className="rounding">{en.result.rounding}</p><div className="settlement"><h2>{en.result.transfers}</h2>{transfers.length === 0 && <p>{en.result.noTransfers}</p>}<ul>{transfers.map(transfer => <li key={`${transfer.fromId}-${transfer.toId}`}><span><strong>{name(transfer.fromId)}</strong> {en.result.pays} <strong>{name(transfer.toId)}</strong></span><strong className="money">{formatEuro(transfer.amountCents)}</strong></li>)}</ul><p className="explanation">{en.result.transferHint}</p></div></section>;
}
