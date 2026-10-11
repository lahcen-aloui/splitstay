"use client";
import { useRef, useState, type FormEvent } from "react";
import { canRemoveParticipant, type Group, type Participant } from "@/lib/group";
import { en } from "@/locales/en";
interface Props { group: Group; disabled: boolean; onAdd: (participant: Participant) => Promise<boolean>; onRemove: (id: string) => void }
export function ParticipantPanel({ group, disabled, onAdd, onRemove }: Props) {
  const [name, setName] = useState("");
  const draftId = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 60) { setError(en.group.invalid); return; }
    if (group.participants.some(participant => participant.id !== draftId.current && participant.name.toLocaleLowerCase("en") === trimmed.toLocaleLowerCase("en"))) { setError(en.group.duplicate); return; }
    draftId.current ??= crypto.randomUUID();
    if (!await onAdd({ id: draftId.current, name: trimmed })) return;
    draftId.current = null;
    setName(""); setError(null);
  }
  return <section className="participant-panel" aria-labelledby="group-title"><h2 id="group-title">{en.group.title}</h2><ul className="participants">{group.participants.map(participant => {
    const protectedParticipant = !canRemoveParticipant(group, participant.id);
    return <li key={participant.id}><div><strong>{participant.name}</strong>{protectedParticipant && <small>{en.group.protected}</small>}</div><button type="button" className="text-button" disabled={disabled || protectedParticipant} aria-label={`${en.group.removeLabel} ${participant.name}`} onClick={() => onRemove(participant.id)}>{en.group.remove}</button></li>;
  })}</ul>{group.participants.length === 0 && <p>{en.group.empty}</p>}<form onSubmit={event => { void submit(event); }} noValidate><label>{en.group.name}<input value={name} maxLength={60} disabled={disabled} onChange={event => setName(event.target.value)} /></label>{error && <p role="alert" className="form-error">{error}</p>}<button type="submit" className="secondary" disabled={disabled}>{en.group.add}</button></form></section>;
}
