/** Mirrors backend lib/template.ts so the builder can preview exactly what will be posted. */
const VARIABLE = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

export function extractVariables(template: string): string[] {
  const seen = new Set<string>();
  for (const match of template.matchAll(VARIABLE)) {
    if (match[1]) seen.add(match[1]);
  }
  return [...seen];
}

/** Renders with a flat map of variable key -> value (e.g. sample values from the catalog). */
export function renderWithValues(template: string, values: Record<string, string>): string {
  return template.replace(VARIABLE, (_m, key: string) => values[key] ?? '');
}
