/**
 * The app catalog: which apps exist, what they can trigger on and what they can do.
 * Single source of truth for the builder UI, server-side validation and (M6) the Copilot prompt.
 * Only apps with available: true can be saved in a Zap; the rest are shown as "Coming soon".
 */

export type FieldType = 'repo' | 'template' | 'text';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  help?: string;
  maxLength?: number;
  defaultValue?: string;
}

export interface VariableDef {
  /** Used in templates as {{key}}. */
  key: string;
  label: string;
  /** Example value for builder previews. */
  sample: string;
}

export interface TriggerDef {
  id: string;
  name: string;
  description: string;
  configFields: FieldDef[];
  variables: VariableDef[];
}

export interface ActionDef {
  id: string;
  name: string;
  description: string;
  fields: FieldDef[];
}

export interface AppDef {
  id: string;
  name: string;
  description: string;
  available: boolean;
  triggers: TriggerDef[];
  actions: ActionDef[];
}

const PR_VARIABLES: VariableDef[] = [
  { key: 'pr.author', label: 'PR author', sample: 'octocat' },
  { key: 'pr.number', label: 'PR number', sample: '42' },
  { key: 'pr.title', label: 'PR title', sample: 'Add dark mode' },
  { key: 'pr.url', label: 'PR link', sample: 'https://github.com/octocat/hello-world/pull/42' },
  { key: 'pr.head', label: 'Source branch', sample: 'feature/dark-mode' },
  { key: 'pr.base', label: 'Target branch', sample: 'main' },
  { key: 'repo.full_name', label: 'Repository', sample: 'octocat/hello-world' },
  { key: 'repo.name', label: 'Repository name', sample: 'hello-world' },
];

export const CATALOG: AppDef[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Pull requests, issues and repositories.',
    available: true,
    triggers: [
      {
        id: 'pull_request.opened',
        name: 'Pull request opened',
        description: 'Runs when someone opens a pull request on the repository.',
        configFields: [
          {
            key: 'repoFullName',
            label: 'Repository',
            type: 'repo',
            required: true,
            help: 'Repositories where you have admin access (needed to install the webhook).',
          },
        ],
        variables: PR_VARIABLES,
      },
    ],
    actions: [
      {
        id: 'pull_request.comment',
        name: 'Comment on pull request',
        description: 'Posts a comment on the pull request that triggered the Zap.',
        fields: [
          {
            key: 'body',
            label: 'Comment',
            type: 'template',
            required: true,
            maxLength: 65_536,
            placeholder: 'Thanks for opening this pull request!',
            defaultValue: 'Thanks @{{pr.author}} for opening #{{pr.number}}!',
            help: 'Markdown is supported. Use the buttons above to insert pull request data.',
          },
        ],
      },
    ],
  },
  // Shown in the picker so the product shape is visible; not runnable yet.
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'Merge requests and pipelines.',
    available: false,
    triggers: [{ id: 'merge_request.opened', name: 'Merge request opened', description: '', configFields: [], variables: [] }],
    actions: [{ id: 'merge_request.comment', name: 'Comment on merge request', description: '', fields: [] }],
  },
  {
    id: 'bitbucket',
    name: 'Bitbucket',
    description: 'Pull requests on Bitbucket Cloud.',
    available: false,
    triggers: [{ id: 'pullrequest.created', name: 'Pull request created', description: '', configFields: [], variables: [] }],
    actions: [{ id: 'pullrequest.comment', name: 'Comment on pull request', description: '', fields: [] }],
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Issues and projects.',
    available: false,
    triggers: [{ id: 'issue.created', name: 'Issue created', description: '', configFields: [], variables: [] }],
    actions: [{ id: 'issue.create', name: 'Create issue', description: '', fields: [] }],
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Channels and messages.',
    available: false,
    triggers: [{ id: 'message.posted', name: 'New channel message', description: '', configFields: [], variables: [] }],
    actions: [{ id: 'message.send', name: 'Send channel message', description: '', fields: [] }],
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Issues and cycles.',
    available: false,
    triggers: [{ id: 'issue.created', name: 'Issue created', description: '', configFields: [], variables: [] }],
    actions: [{ id: 'issue.create', name: 'Create issue', description: '', fields: [] }],
  },
];

export function findApp(appId: string): AppDef | undefined {
  return CATALOG.find((a) => a.id === appId);
}

export function findTrigger(appId: string, triggerId: string): TriggerDef | undefined {
  return findApp(appId)?.triggers.find((t) => t.id === triggerId);
}

export function findAction(appId: string, actionId: string): ActionDef | undefined {
  return findApp(appId)?.actions.find((a) => a.id === actionId);
}

/** Key used to index and dispatch triggers, e.g. "github:pull_request.opened". */
export function triggerKey(appId: string, triggerId: string): string {
  return `${appId}:${triggerId}`;
}
