import { HttpError } from '../lib/http-error.js';
import { extractVariables } from '../lib/template.js';
import { findAction, findApp, findTrigger, type FieldDef } from './catalog.js';

export interface ZapShape {
  name: string;
  enabled: boolean;
  trigger: { app: string; event: string; config: Record<string, string> };
  action: { app: string; type: string; fields: Record<string, string> };
}

export interface ValidationIssue {
  path: string;
  message: string;
}

const REPO_FULL_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function checkFields(
  defs: FieldDef[],
  values: Record<string, string>,
  basePath: string,
  allowedVariables: Set<string>,
  issues: ValidationIssue[],
): void {
  const known = new Set(defs.map((d) => d.key));
  for (const key of Object.keys(values)) {
    if (!known.has(key)) issues.push({ path: `${basePath}.${key}`, message: `Unknown field "${key}"` });
  }

  for (const def of defs) {
    const path = `${basePath}.${def.key}`;
    const value = (values[def.key] ?? '').trim();
    if (!value) {
      if (def.required) issues.push({ path, message: `${def.label} is required` });
      continue;
    }
    if (def.maxLength && value.length > def.maxLength) {
      issues.push({ path, message: `${def.label} must be at most ${def.maxLength} characters` });
    }
    if (def.type === 'repo' && !REPO_FULL_NAME.test(value)) {
      issues.push({ path, message: `${def.label} must look like owner/repository` });
    }
    if (def.type === 'template') {
      const unknown = extractVariables(value).filter((v) => !allowedVariables.has(v));
      if (unknown.length) {
        issues.push({ path, message: `Unknown data: ${unknown.map((v) => `{{${v}}}`).join(', ')}` });
      }
    }
  }
}

/** Checks a Zap against the catalog. Returns every problem found, not just the first. */
export function findZapIssues(zap: ZapShape): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const triggerApp = findApp(zap.trigger.app);
  const trigger = findTrigger(zap.trigger.app, zap.trigger.event);
  if (!triggerApp) {
    issues.push({ path: 'trigger.app', message: `Unknown app "${zap.trigger.app}"` });
  } else if (!triggerApp.available) {
    issues.push({ path: 'trigger.app', message: `${triggerApp.name} is coming soon and can't be used yet` });
  } else if (!trigger) {
    issues.push({ path: 'trigger.event', message: `Unknown ${triggerApp.name} trigger "${zap.trigger.event}"` });
  }

  const allowedVariables = new Set(trigger?.variables.map((v) => v.key) ?? []);
  if (trigger) checkFields(trigger.configFields, zap.trigger.config, 'trigger.config', allowedVariables, issues);

  const actionApp = findApp(zap.action.app);
  const action = findAction(zap.action.app, zap.action.type);
  if (!actionApp) {
    issues.push({ path: 'action.app', message: `Unknown app "${zap.action.app}"` });
  } else if (!actionApp.available) {
    issues.push({ path: 'action.app', message: `${actionApp.name} is coming soon and can't be used yet` });
  } else if (!action) {
    issues.push({ path: 'action.type', message: `Unknown ${actionApp.name} action "${zap.action.type}"` });
  }
  if (action) checkFields(action.fields, zap.action.fields, 'action.fields', allowedVariables, issues);

  return issues;
}

/** Throws 400 validation_error with every issue as details. */
export function assertValidZap(zap: ZapShape): void {
  const issues = findZapIssues(zap);
  if (issues.length) {
    throw new HttpError(400, 'validation_error', 'The Zap is not valid', issues);
  }
}
