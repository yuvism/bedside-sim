import type { Path } from './context.ts';
import {
  defaultFor,
  discriminatorOf,
  literalValue,
  optionsOf,
  shapeOf,
  variantIndex,
  variantKey,
} from './introspect.ts';
import { CONDITION_LABELS, labelFor } from './labels.ts';
import { ObjectFields, type Schema } from './SchemaField.tsx';

const RULE_LABELS: Record<string, string> = {
  actionDone: 'Action done',
  actionWithin: 'Action done within a time',
  actionBefore: 'Action done before another',
  actionNever: 'Action never done',
  actionCount: 'Action done a number of times',
  examined: 'Examined',
  asked: 'Asked',
  diagnosisIs: 'Diagnosis is',
  outcomeIs: 'Outcome is',
  vitalNeverBelow: 'Vital never below',
  vitalNeverAbove: 'Vital never above',
  rulePassed: 'Another rule passed',
  ruleFailed: 'Another rule failed',
  all: 'All of',
  any: 'Any of',
  not: 'Not',
};

function optionLabel(option: Schema, disc: string | null): string {
  if (disc) {
    const v = String(literalValue(shapeOf(option)[disc] as Schema));
    return RULE_LABELS[v] ?? labelFor(v);
  }
  const k = variantKey(option);
  return CONDITION_LABELS[k] ?? labelFor(k);
}

/**
 * A union of object shapes (conditions, scoring tests): pick the type, then
 * edit its fields. Fields the old and new types share are kept on a switch.
 */
export function UnionField({
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
  const options = optionsOf(schema);
  const disc = discriminatorOf(schema);
  const idx = variantIndex(schema, value);
  const current = idx >= 0 ? options[idx] : undefined;

  const pick = (i: number) => {
    const opt = options[i];
    if (!opt) return;
    const next = defaultFor(opt) as Record<string, unknown>;
    const old = (typeof value === 'object' && value !== null ? value : {}) as Record<
      string,
      unknown
    >;
    for (const k of Object.keys(shapeOf(opt))) {
      if (k !== disc && k in old) next[k] = old[k];
    }
    onChange(next);
  };

  return (
    <div className="field-union">
      <select
        className="input union-type"
        value={idx}
        aria-label={`${labelFor(name)} type`}
        onChange={(e) => pick(Number(e.target.value))}
      >
        {idx < 0 && <option value={-1}>Choose a type…</option>}
        {options.map((o, i) => (
          <option key={i} value={i}>
            {optionLabel(o, disc)}
          </option>
        ))}
      </select>
      {current && (
        <ObjectFields
          schema={current}
          value={value}
          onChange={onChange}
          path={path}
          skip={disc ? [disc] : []}
        />
      )}
    </div>
  );
}
