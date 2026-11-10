/**
 * Shared state for the schema form: validation issues by path, and the
 * suggestion lists offered for id-like fields.
 */
import { createContext, useContext } from 'react';

export type Path = readonly (string | number)[];

export const pathKey = (p: Path): string => p.join('.');

export interface FormIssues {
  /** Messages for exactly this path. */
  at(path: Path): string[];
  /** True when this path or anything under it has a problem. */
  under(path: Path): boolean;
}

export function indexIssues(issues: readonly { path: Path; message: string }[]): FormIssues {
  const exact = new Map<string, string[]>();
  const prefixes = new Set<string>();
  for (const i of issues) {
    const k = pathKey(i.path);
    exact.set(k, [...(exact.get(k) ?? []), i.message]);
    for (let n = 0; n <= i.path.length; n++) prefixes.add(pathKey(i.path.slice(0, n)));
  }
  return {
    at: (p) => exact.get(pathKey(p)) ?? [],
    under: (p) => prefixes.has(pathKey(p)),
  };
}

export interface FormContextValue {
  issues: FormIssues;
  /** Datalist id offering suggestions for this field, if any. */
  suggestionList(key: string, path: Path): string | undefined;
}

export const FormContext = createContext<FormContextValue>({
  issues: indexIssues([]),
  suggestionList: () => undefined,
});

export const useForm = () => useContext(FormContext);
