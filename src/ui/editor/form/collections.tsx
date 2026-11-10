import { useState } from 'react';
import { useForm, type Path } from './context.ts';
import {
  defaultFor,
  elementOf,
  itemsOf,
  kindOf,
  minItems,
  recordValueOf,
  shapeOf,
  unwrap,
} from './introspect.ts';
import { itemSummary, singularFor } from './labels.ts';
import { FieldBody, Issues, type Schema } from './SchemaField.tsx';

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** A fresh item; list items with an id get a unique placeholder id. */
function newItem(element: Schema, existing: readonly unknown[]): unknown {
  const item = defaultFor(element);
  if (kindOf(unwrap(element).schema) === 'object' && 'id' in shapeOf(unwrap(element).schema)) {
    const ids = new Set(existing.map((x) => (x as { id?: unknown } | null)?.id));
    let n = existing.length + 1;
    while (ids.has(`new-${n}`)) n++;
    return { ...(item as object), id: `new-${n}` };
  }
  return item;
}

export function ArrayField({
  schema,
  value,
  onChange,
  path,
  name,
}: {
  schema: Schema;
  value: unknown;
  onChange(v: unknown): void;
  path: Path;
  name: string;
}) {
  const list = asArray(value);
  const element = elementOf(schema);
  const complex = ['object', 'union', 'array', 'record'].includes(kindOf(unwrap(element).schema));
  const min = minItems(schema);
  const [opened, setOpened] = useState<number | null>(null);
  const { issues } = useForm();

  const replace = (i: number, v: unknown) => onChange(list.map((x, j) => (j === i ? v : x)));
  const remove = (i: number) => onChange(list.filter((_, j) => j !== i));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => {
    setOpened(list.length);
    onChange([...list, newItem(element, list)]);
  };
  const itemLabel = singularFor(name);

  const tools = (i: number) => (
    <span className="item-tools">
      <button
        type="button"
        className="link-btn"
        onClick={() => move(i, -1)}
        disabled={i === 0}
        aria-label="Move up"
      >
        ↑
      </button>
      <button
        type="button"
        className="link-btn"
        onClick={() => move(i, 1)}
        disabled={i === list.length - 1}
        aria-label="Move down"
      >
        ↓
      </button>
      {complex && (
        <button
          type="button"
          className="link-btn"
          onClick={() =>
            onChange([...list.slice(0, i + 1), structuredClone(list[i]), ...list.slice(i + 1)])
          }
        >
          Duplicate
        </button>
      )}
      <button
        type="button"
        className="link-btn danger"
        onClick={() => remove(i)}
        disabled={list.length <= min}
      >
        Remove
      </button>
    </span>
  );

  return (
    <div className="field-array">
      {list.length === 0 && <p className="field-help">None yet.</p>}
      {list.map((item, i) => {
        const p = [...path, i];
        if (!complex) {
          return (
            <div key={i} className="array-row">
              <FieldBody
                schema={unwrap(element).schema}
                value={item}
                onChange={(v) => replace(i, v)}
                path={p}
                name={name}
              />
              {tools(i)}
              <Issues path={p} />
            </div>
          );
        }
        const bad = issues.under(p);
        return (
          <details
            key={i}
            className={`array-item${bad ? ' has-issues' : ''}`}
            open={opened === i || list.length <= 2 || undefined}
          >
            <summary>
              <span className="item-title">{itemSummary(item, i)}</span>
              {bad && <span className="issue-dot" aria-label="has problems" />}
            </summary>
            <div className="item-body">
              {tools(i)}
              <FieldBody
                schema={unwrap(element).schema}
                value={item}
                onChange={(v) => replace(i, v)}
                path={p}
                name={name}
              />
              <Issues path={p} />
            </div>
          </details>
        );
      })}
      <button type="button" className="btn small" onClick={add}>
        + Add {itemLabel}
      </button>
    </div>
  );
}

const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function RecordField({
  schema,
  value,
  onChange,
  path,
}: {
  schema: Schema;
  value: unknown;
  onChange(v: unknown): void;
  path: Path;
}) {
  const rec = asRecord(value);
  const valueSchema = recordValueOf(schema);
  const entries = Object.entries(rec);
  const rename = (from: string, to: string) => {
    if (to === from || to in rec) return;
    onChange(Object.fromEntries(entries.map(([k, v]) => [k === from ? to : k, v])));
  };
  const add = () => {
    let n = entries.length + 1;
    while (`key${n}` in rec) n++;
    onChange({ ...rec, [`key${n}`]: defaultFor(valueSchema) });
  };
  return (
    <div className="field-record">
      {entries.length === 0 && <p className="field-help">None yet.</p>}
      {entries.map(([k, v]) => (
        <div key={k} className="record-row">
          <input
            className="input record-key"
            defaultValue={k}
            aria-label="Key"
            onBlur={(e) => rename(k, e.target.value.trim())}
          />
          <div className="record-value">
            <FieldBody
              schema={unwrap(valueSchema).schema}
              value={v}
              onChange={(nv) => onChange({ ...rec, [k]: nv })}
              path={[...path, k]}
              name={k}
            />
            <Issues path={[...path, k]} />
          </div>
          <button
            type="button"
            className="link-btn danger"
            onClick={() => onChange(Object.fromEntries(entries.filter(([x]) => x !== k)))}
          >
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="btn small" onClick={add}>
        + Add entry
      </button>
    </div>
  );
}

export function TupleField({
  schema,
  value,
  onChange,
  path,
  name,
}: {
  schema: Schema;
  value: unknown;
  onChange(v: unknown): void;
  path: Path;
  name: string;
}) {
  const items = itemsOf(schema);
  const tuple = asArray(value);
  return (
    <div className="field-tuple">
      {items.map((s, i) => (
        <FieldBody
          key={i}
          schema={unwrap(s).schema}
          value={tuple[i]}
          onChange={(v) => onChange(items.map((_, j) => (j === i ? v : tuple[j])))}
          path={[...path, i]}
          name={`${name} ${i === 0 ? 'from' : 'to'}`}
        />
      ))}
    </div>
  );
}
