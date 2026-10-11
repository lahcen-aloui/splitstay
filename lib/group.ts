import { en } from "@/locales/en";
export interface Participant { id: string; name: string }
export interface Expense { id: string; description: string; payerId: string; amountCents: number; participantIds: string[] }
export interface Group { version: 1; participants: Participant[]; expenses: Expense[] }
export interface Settlement { fromId: string; toId: string; amountCents: number }
const maxCents = BigInt(Number.MAX_SAFE_INTEGER);
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown, max: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
function positiveCents(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
export function parseEuroCents(input: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const cents = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (cents <= BigInt(0) || cents > maxCents) return null;
  return Number(cents);
}
export function splitCents(amountCents: number, ids: string[]): Record<string, number> {
  if (!positiveCents(amountCents) || ids.length === 0 || ids.some(id => !text(id, 100)) || new Set(ids).size !== ids.length) throw new Error(en.errors.invalidSplit);
  const base = Math.floor(amountCents / ids.length);
  const remainder = amountCents % ids.length;
  return Object.fromEntries(ids.map((id, index) => [id, base + (index < remainder ? 1 : 0)]));
}
export function decodeGroup(value: unknown): Group | null {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.participants) || !Array.isArray(value.expenses)) return null;
  const participants: Participant[] = [];
  const participantIds = new Set<string>();
  for (const entry of value.participants) {
    if (!record(entry) || !text(entry.id, 100) || !text(entry.name, 60) || participantIds.has(entry.id)) return null;
    participants.push({ id: entry.id, name: entry.name });
    participantIds.add(entry.id);
  }
  const expenses: Expense[] = [];
  const expenseIds = new Set<string>();
  let total = BigInt(0);
  for (const entry of value.expenses) {
    if (!record(entry) || !text(entry.id, 100) || expenseIds.has(entry.id) || !text(entry.description, 120) || !positiveCents(entry.amountCents) || typeof entry.payerId !== "string" || !participantIds.has(entry.payerId) || !Array.isArray(entry.participantIds) || entry.participantIds.length === 0) return null;
    const selected: string[] = [];
    for (const id of entry.participantIds) {
      if (typeof id !== "string" || !participantIds.has(id) || selected.includes(id)) return null;
      selected.push(id);
    }
    total += BigInt(entry.amountCents);
    if (total > maxCents) return null;
    expenseIds.add(entry.id);
    expenses.push({ id: entry.id, description: entry.description, amountCents: entry.amountCents, payerId: entry.payerId, participantIds: selected });
  }
  return { version: 1, participants, expenses };
}
export function balances(group: Group): Record<string, number> {
  const decoded = decodeGroup(group);
  if (!decoded) throw new Error(en.errors.invalidGroup);
  const result: Record<string, number> = Object.fromEntries(decoded.participants.map(participant => [participant.id, 0]));
  for (const expense of decoded.expenses) {
    result[expense.payerId] += expense.amountCents;
    const selected = decoded.participants.filter(participant => expense.participantIds.includes(participant.id)).map(participant => participant.id);
    for (const [id, cents] of Object.entries(splitCents(expense.amountCents, selected))) result[id] -= cents;
  }
  if (Object.values(result).reduce((sum, cents) => sum + BigInt(cents), BigInt(0)) !== BigInt(0)) throw new Error(en.errors.invalidBalance);
  return result;
}
export function settlements(balance: Record<string, number>): Settlement[] {
  const entries = Object.entries(balance).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  if (entries.some(([, cents]) => !Number.isSafeInteger(cents)) || entries.reduce((sum, [, cents]) => sum + BigInt(cents), BigInt(0)) !== BigInt(0)) throw new Error(en.errors.invalidBalance);
  const creditors = entries.filter(([, cents]) => cents > 0).map(([id, cents]) => ({ id, cents }));
  const debtors = entries.filter(([, cents]) => cents < 0).map(([id, cents]) => ({ id, cents: -cents }));
  const transfers: Settlement[] = [];
  let creditorIndex = 0;
  for (const debtor of debtors) {
    while (debtor.cents > 0) {
      const creditor = creditors[creditorIndex];
      const amountCents = Math.min(debtor.cents, creditor.cents);
      transfers.push({ fromId: debtor.id, toId: creditor.id, amountCents });
      debtor.cents -= amountCents;
      creditor.cents -= amountCents;
      if (creditor.cents === 0) creditorIndex++;
    }
  }
  return transfers;
}
export function canRemoveParticipant(group: Group, id: string): boolean {
  return group.participants.some(participant => participant.id === id) && !group.expenses.some(expense => expense.payerId === id || expense.participantIds.includes(id));
}
export function formatEuro(cents: number): string {
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100).toLocaleString("en-IE");
  return `${cents < 0 ? "−" : ""}€${whole}.${String(absolute % 100).padStart(2, "0")}`;
}
export function sampleGroup(): Group {
  return { version: 1, participants: [{ id: "alex", name: en.sample.alex }, { id: "bea", name: en.sample.bea }, { id: "chris", name: en.sample.chris }], expenses: [{ id: "apartment", description: en.sample.apartment, payerId: "alex", amountCents: 24000, participantIds: ["alex", "bea", "chris"] }, { id: "dinner", description: en.sample.dinner, payerId: "bea", amountCents: 6850, participantIds: ["alex", "bea", "chris"] }, { id: "groceries", description: en.sample.groceries, payerId: "chris", amountCents: 2240, participantIds: ["bea", "chris"] }] };
}
