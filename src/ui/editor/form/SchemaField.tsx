/**
 * Draws an editor for any part of the case schema by reading the Zod schema:
 * objects become fieldsets, lists get add/remove/reorder, unions get a type
 * picker, and optional fields can be added or removed.
 */
import type { z } from 'zod';
import { ArrayField, RecordField, TupleField } from './collections.tsx';
import { useForm, pathKey, type Path } from './context.ts';
import { defaultFor, kindOf, shapeOf, unwrap } from './introspect.ts';
import { helpFor, labelFor } from './labels.ts';
import { BoolField, EnumField, LiteralField, NumberField, TextField } from './primitives.tsx';
import { UnionField } from './unions.tsx';

export type Schema = z.core.$ZodType;

export interface FieldProps {
  schema: Schema;
  value: unknown;
  onChange(v: unknown): void;
  path: Path;
  /** The key this value sits under (drives labels, help and suggestions). */
  name: string;
}

export function Issues({ path }: { path: Path }) {
  const msgs = useForm().issues.at(path);
  if (!msgs.length) return null;
  return (
    <ul className="field-issues" role="alert">
      {msgs.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}

/** A labelled field, with add/remove for optional ones. */
export function SchemaField(props: FieldProps) {
  const { schema: raw, value, onChange, path, name } = props;
  const { schema, optional } = unwrap(raw);
  const label = labelFor(name);
  if (optional && value === undefined) {
    return (
      <div className="field-row optional-empty" data-path={pathKey(path)}>
        <button type="button" className="btn small" onClick={() => onChange(defaultFor(schema))}>
          + Add {label.toLowerCase()}
        </button>
      </div>
    );
  }
  const kind = kindOf(schema);
  const help = helpFor(name);
  const inner = <FieldBody {...props} schema={schema} />;
  const remove = optional && (
    <button
      type="button"
      className="link-btn"
      onClick={() => onChange(undefined)}
      aria-label={`Remove ${label.toLowerCase()}`}
    >
      Remove
    </button>
  );
  if (kind === 'object' || kind === 'array' || kind === 'record' || kind === 'union') {
    return (
      <fieldset className={`field-group kind-${kind}`} data-path={pathKey(path)}>
        <legend>
          {label} {remove}
        </legend>
        {help && <p className="field-help">{help}</p>}
        {inner}
        <Issues path={path} />
      </fieldset>
    );
  }
  return (
    <div className="field-row" data-path={pathKey(path)}>
      <div className="field-label">
        <span>{label}</span> {remove}
      </div>
      {inner}
      {help && <p className="field-help">{help}</p>}
      <Issues path={path} />
    </div>
  );
}

/** The editor for an already-unwrapped schema, without label chrome. */
export function FieldBody({ schema, value, onChange, path, name }: FieldProps) {
  const label = labelFor(name);
  switch (kindOf(schema)) {
    case 'string':
      return <TextField value={value} onChange={onChange} name={name} path={path} label={label} />;
    case 'number':
      return <NumberField schema={schema} value={value} onChange={onChange} label={label} />;
    case 'boolean':
      return <BoolField value={value} onChange={onChange} label={label} />;
    case 'enum':
      return <EnumField schema={schema} value={value} onChange={onChange} label={label} />;
    case 'literal':
      return <LiteralField schema={schema} />;
    case 'object':
      return <ObjectFields schema={schema} value={value} onChange={onChange} path={path} />;
    case 'array':
      return (
        <ArrayField schema={schema} value={value} onChange={onChange} path={path} name={name} />
      );
    case 'record':
      return <RecordField schema={schema} value={value} onChange={onChange} path={path} />;
    case 'tuple':
      return (
        <TupleField schema={schema} value={value} onChange={onChange} path={path} name={name} />
      );
    case 'union':
      return (
        <UnionField schema={schema} value={value} onChange={onChange} path={path} name={name} />
      );
    default:
      return <p className="field-help">This field can only be edited in Raw JSON.</p>;
  }
}

const asObject = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function ObjectFields({
  schema,
  value,
  onChange,
  path,
  skip = [],
}: {
  schema: Schema;
  value: unknown;
  onChange(v: unknown): void;
  path: Path;
  /** Keys drawn elsewhere (e.g. a union's type picker). */
  skip?: readonly string[];
}) {
  const obj = asObject(value);
  const set = (k: string, v: unknown) => {
    const next = { ...obj };
    if (v === undefined) delete next[k];
    else next[k] = v;
    onChange(next);
  };
  return (
    <div className="field-object">
      {Object.entries(shapeOf(schema))
        .filter(([k]) => !skip.includes(k))
        .map(([k, s]) => (
          <SchemaField
            key={k}
            schema={s}
            value={obj[k]}
            onChange={(v) => set(k, v)}
            path={[...path, k]}
            name={k}
          />
        ))}
    </div>
  );
}
