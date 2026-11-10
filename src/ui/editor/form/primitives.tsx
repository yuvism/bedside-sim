import { useState } from 'react';
import type { z } from 'zod';
import { useForm, type Path } from './context.ts';
import { enumValues, literalValue, numberBounds } from './introspect.ts';
import { isLongText } from './labels.ts';

type Schema = z.core.$ZodType;

export function TextField({
  value,
  onChange,
  name,
  path,
  label,
}: {
  value: unknown;
  onChange(v: unknown): void;
  name: string;
  path: Path;
  label: string;
}) {
  const list = useForm().suggestionList(name, path);
  const text = typeof value === 'string' ? value : '';
  if (isLongText(name)) {
    return (
      <textarea
        className="input"
        rows={text.length > 120 ? 4 : 2}
        value={text}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      className="input"
      value={text}
      list={list}
      aria-label={label}
      spellCheck={name !== 'id'}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * Keeps what the user is typing (for example "-" or "1.") while only sending
 * finished numbers up. An empty required box sends "" so validation flags it.
 */
export function NumberField({
  schema,
  value,
  onChange,
  label,
}: {
  schema: Schema;
  value: unknown;
  onChange(v: unknown): void;
  label: string;
}) {
  const shown = typeof value === 'number' ? String(value) : '';
  const [draft, setDraft] = useState<{ text: string; from: string } | null>(null);
  // Reset local text whenever the value changes from outside.
  const text = draft && draft.from === shown ? draft.text : shown;
  const b = numberBounds(schema);
  return (
    <input
      className="input num"
      type="number"
      inputMode="decimal"
      step={b.int ? 1 : 'any'}
      min={b.min}
      max={b.max}
      value={text}
      aria-label={label}
      onChange={(e) => {
        const t = e.target.value;
        const n = Number(t);
        const next = t.trim() === '' ? '' : Number.isFinite(n) ? n : value;
        setDraft({ text: t, from: typeof next === 'number' ? String(next) : shown });
        onChange(next);
      }}
    />
  );
}

export function BoolField({
  value,
  onChange,
  label,
}: {
  value: unknown;
  onChange(v: unknown): void;
  label: string;
}) {
  return (
    <label className="check-inline">
      <input
        type="checkbox"
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function EnumField({
  schema,
  value,
  onChange,
  label,
}: {
  schema: Schema;
  value: unknown;
  onChange(v: unknown): void;
  label: string;
}) {
  const opts = enumValues(schema);
  const v = typeof value === 'string' ? value : '';
  return (
    <select
      className="input"
      value={v}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    >
      {!opts.includes(v) && <option value={v}>{v || 'Choose…'}</option>}
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function LiteralField({ schema }: { schema: Schema }) {
  return <code className="literal">{JSON.stringify(literalValue(schema))}</code>;
}
