/**
 * Minimal, safe templating for Zap fields: {{ path.to.value }} and nothing else.
 * No expressions, no eval; values are looked up in a plain context object by own keys only.
 */
const VARIABLE = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

/** Variable keys used in a template, in order of first appearance, without duplicates. */
export function extractVariables(template: string): string[] {
  const seen = new Set<string>();
  for (const match of template.matchAll(VARIABLE)) {
    if (match[1]) seen.add(match[1]);
  }
  return [...seen];
}

function lookup(context: unknown, path: string): unknown {
  let current: unknown = context;
  for (const part of path.split('.')) {
    if (FORBIDDEN.has(part) || current === null || typeof current !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Replaces each {{key}} with its value from context; unknown keys become an empty string. */
export function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(VARIABLE, (_m, path: string) => {
    const value = lookup(context, path);
    return value === undefined || value === null ? '' : String(value);
  });
}
