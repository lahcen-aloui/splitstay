import { describe, expect, it } from "vitest";
import { balances, canRemoveParticipant, decodeGroup, parseEuroCents, settlements, splitCents, type Group } from "./group";
const participants = [{ id: "a", name: "Alex" }, { id: "b", name: "Bea" }, { id: "c", name: "Chris" }];
const group: Group = { version: 1, participants, expenses: [{ id: "e", description: "Dinner", payerId: "a", amountCents: 1000, participantIds: ["b", "c"] }] };
describe("exact euro parsing", () => {
  it.each([["1", 100], ["1.2", 120], ["1,23", 123], [" 0.01 ", 1], ["90071992547409.91", Number.MAX_SAFE_INTEGER]])("parses %s as %s cents", (input, expected) => expect(parseEuroCents(input)).toBe(expected));
  it.each(["1.001", "-2", "0", "0.00", "1e3", "1,000.20", ".5", "90071992547409.92", "Infinity", ""]) ("rejects %s", input => expect(parseEuroCents(input)).toBeNull());
});
describe("split and balance", () => {
  it("allocates remainder cents in supplied participant order", () => expect(splitCents(1000, ["c", "a", "b"])).toEqual({ c: 334, a: 333, b: 333 }));
  it("splits one cent without losing it", () => expect(splitCents(1, ["a", "b", "c"])).toEqual({ a: 1, b: 0, c: 0 }));
  it.each([[0, ["a"]], [1.5, ["a"]], [1, []], [1, ["a", "a"]], [Number.MAX_SAFE_INTEGER + 1, ["a"]]])("rejects invalid splits", (amount, ids) => expect(() => splitCents(amount, ids)).toThrow());
  it("credits a payer outside the split", () => expect(balances(group)).toEqual({ a: 1000, b: -500, c: -500 }));
  it("combines expenses while maintaining zero net balance", () => {
    const result = balances({ ...group, expenses: [...group.expenses, { id: "f", description: "Taxi", payerId: "b", amountCents: 1001, participantIds: ["a", "b", "c"] }] });
    expect(result).toEqual({ a: 666, b: 167, c: -833 });
    expect(Object.values(result).reduce((sum, value) => sum + value, 0)).toBe(0);
  });
  it("settles every balance deterministically", () => {
    const original = { d: -900, c: 200, b: -300, a: 1000 };
    const transfers = settlements(original);
    expect(transfers).toEqual([{ fromId: "b", toId: "a", amountCents: 300 }, { fromId: "d", toId: "a", amountCents: 700 }, { fromId: "d", toId: "c", amountCents: 200 }]);
    const remaining = { ...original } as Record<string, number>;
    for (const transfer of transfers) { remaining[transfer.fromId] += transfer.amountCents; remaining[transfer.toId] -= transfer.amountCents; }
    expect(Object.values(remaining)).toEqual([0, 0, 0, 0]);
    expect(original.a).toBe(1000);
  });
  it("rejects unbalanced or unsafe settlement inputs", () => { expect(() => settlements({ a: 1 })).toThrow(); expect(() => settlements({ a: Number.MAX_SAFE_INTEGER + 1, b: -Number.MAX_SAFE_INTEGER - 1 })).toThrow(); });
  it("blocks removal of both payers and selected participants", () => { expect(canRemoveParticipant(group, "a")).toBe(false); expect(canRemoveParticipant(group, "b")).toBe(false); expect(canRemoveParticipant({ ...group, expenses: [] }, "a")).toBe(true); });
});
describe("nested stored group validation", () => {
  it("decodes a valid group", () => expect(decodeGroup(group)).toEqual(group));
  it.each([null, { ...group, version: 2 }, { ...group, participants: [...participants, participants[0]] }, { ...group, participants: [{ id: "a", name: " " }] }, { ...group, expenses: [...group.expenses, group.expenses[0]] }])("rejects malformed group structure", value => expect(decodeGroup(value)).toBeNull());
  it.each([{ payerId: "unknown" }, { participantIds: ["unknown"] }, { participantIds: ["b", "b"] }, { participantIds: [] }, { amountCents: 0 }, { amountCents: 0.5 }, { amountCents: Number.MAX_SAFE_INTEGER + 1 }, { description: " " }])("rejects malformed nested expense", change => expect(decodeGroup({ ...group, expenses: [{ ...group.expenses[0], ...change }] })).toBeNull());
  it("rejects aggregate expense total exceeding safe integer", () => expect(decodeGroup({ ...group, expenses: [{ ...group.expenses[0], amountCents: Number.MAX_SAFE_INTEGER }, { ...group.expenses[0], id: "f", amountCents: 1 }] })).toBeNull());
  it("makes calculations reject invalid references", () => expect(() => balances({ ...group, expenses: [{ ...group.expenses[0], payerId: "unknown" }] })).toThrow());
});
