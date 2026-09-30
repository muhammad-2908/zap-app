import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { apiErrorMessage, apiIssues } from '../../core/api/api-errors';
import { CatalogApi, findAction, findApp, findTrigger } from '../../core/api/catalog-api';
import { GithubApi } from '../../core/api/github-api';
import { ZapsApi } from '../../core/api/zaps-api';
import { CatalogApp, FieldDef, Repo, Zap, ZapInput } from '../../core/models';
import { extractVariables } from '../../core/template';
import { ToastService } from '../../core/ui/toast-service';
import { AppPicker } from './components/app-picker';
import { StatusToggle } from './components/status-toggle';
import { TemplateField } from './components/template-field';

type FieldsGroup = FormGroup<Record<string, FormControl<string>>>;

const requiredTrimmed: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  typeof c.value === 'string' && c.value.trim() ? null : { required: true };

/**
 * Create and edit a Zap (route /zaps/new and /zaps/:id). The form is built from the catalog:
 * picking a trigger/action rebuilds its field group from the catalog's field definitions.
 */
@Component({
  selector: 'app-zap-builder-page',
  imports: [ReactiveFormsModule, RouterLink, AppPicker, StatusToggle, TemplateField],
  templateUrl: './zap-builder-page.html',
  styleUrl: './zap-builder-page.scss',
})
export class ZapBuilderPage implements OnInit {
  /** Route param :id (edit mode). Undefined on /zaps/new. */
  readonly id = input<string>();

  private readonly catalogApi = inject(CatalogApi);
  private readonly zapsApi = inject(ZapsApi);
  private readonly githubApi = inject(GithubApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly pageState = signal<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  protected readonly pageError = signal('');
  protected readonly catalog = signal<CatalogApp[]>([]);
  protected readonly repos = signal<Repo[]>([]);
  protected readonly reposState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly isEdit = computed(() => !!this.id());

  // Current selections as signals, so everything derived from them recomputes (zoneless-friendly).
  protected readonly triggerApp = signal('');
  protected readonly triggerEvent = signal('');
  protected readonly actionApp = signal('');
  protected readonly actionType = signal('');

  protected readonly triggerApps = computed(() => this.catalog().filter((a) => a.triggers.length));
  protected readonly actionApps = computed(() => this.catalog().filter((a) => a.actions.length));
  protected readonly triggerAppDef = computed(() => findApp(this.catalog(), this.triggerApp()));
  protected readonly actionAppDef = computed(() => findApp(this.catalog(), this.actionApp()));
  protected readonly trigger = computed(() =>
    findTrigger(this.catalog(), this.triggerApp(), this.triggerEvent()),
  );
  protected readonly action = computed(() =>
    findAction(this.catalog(), this.actionApp(), this.actionType()),
  );
  protected readonly variables = computed(() => this.trigger()?.variables ?? []);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [requiredTrimmed, Validators.maxLength(100)],
    }),
    enabled: new FormControl(false, { nonNullable: true }),
    trigger: new FormGroup({
      app: new FormControl('', { nonNullable: true, validators: Validators.required }),
      event: new FormControl('', { nonNullable: true, validators: Validators.required }),
      config: new FormGroup<Record<string, FormControl<string>>>({}),
    }),
    action: new FormGroup({
      app: new FormControl('', { nonNullable: true, validators: Validators.required }),
      type: new FormControl('', { nonNullable: true, validators: Validators.required }),
      fields: new FormGroup<Record<string, FormControl<string>>>({}),
    }),
  });

  protected get triggerConfig(): FieldsGroup {
    return this.form.controls.trigger.controls.config;
  }

  protected get actionFields(): FieldsGroup {
    return this.form.controls.action.controls.fields;
  }

  ngOnInit(): void {
    const id = this.id();
    forkJoin({
      catalog: this.catalogApi.getCatalog(),
      zap: id ? this.zapsApi.get(id) : of(null),
    }).subscribe({
      next: ({ catalog, zap }) => {
        this.catalog.set(catalog);
        if (zap) this.populate(zap);
        else this.startNew();
        this.pageState.set('ready');
      },
      error: (err: { status?: number }) => {
        if (err?.status === 404) this.pageState.set('not-found');
        else {
          this.pageError.set(apiErrorMessage(err));
          this.pageState.set('error');
        }
      },
    });
    this.loadRepos();
  }

  protected loadRepos(fresh = false): void {
    this.reposState.set('loading');
    this.githubApi.repos(fresh).subscribe({
      next: (repos) => {
        this.repos.set(repos);
        this.reposState.set('ready');
      },
      error: () => this.reposState.set('error'),
    });
  }

  // ---- selection ----

  protected pickTriggerApp(appId: string, config: Record<string, string> = {}): void {
    this.triggerApp.set(appId);
    this.form.controls.trigger.controls.app.setValue(appId);
    const triggers = findApp(this.catalog(), appId)?.triggers ?? [];
    // One trigger (GitHub today): choose it for the user.
    this.pickTriggerEvent(triggers.length === 1 ? triggers[0]!.id : '', config);
  }

  protected pickTriggerEvent(eventId: string, config: Record<string, string> = {}): void {
    const keep = { ...this.triggerConfig.getRawValue(), ...config };
    this.triggerEvent.set(eventId);
    this.form.controls.trigger.controls.event.setValue(eventId);
    this.rebuild(this.triggerConfig, this.trigger()?.configFields ?? [], keep);
    // Available variables changed: re-check templates that use them.
    this.actionFields.updateValueAndValidity();
    Object.values(this.actionFields.controls).forEach((c) => c.updateValueAndValidity());
  }

  protected pickActionApp(appId: string, fields: Record<string, string> = {}): void {
    this.actionApp.set(appId);
    this.form.controls.action.controls.app.setValue(appId);
    const actions = findApp(this.catalog(), appId)?.actions ?? [];
    this.pickActionType(actions.length === 1 ? actions[0]!.id : '', fields);
  }

  protected pickActionType(typeId: string, fields: Record<string, string> = {}): void {
    const keep = { ...this.actionFields.getRawValue(), ...fields };
    this.actionType.set(typeId);
    this.form.controls.action.controls.type.setValue(typeId);
    this.rebuild(this.actionFields, this.action()?.fields ?? [], keep, !this.isEdit());
  }

  protected setEnabled(value: boolean): void {
    this.form.controls.enabled.setValue(value);
    this.form.markAsDirty();
  }

  // ---- save ----

  protected save(): void {
    this.formError.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.formError.set('Fix the highlighted fields and try again.');
      return;
    }

    const value = this.form.getRawValue();
    const input: ZapInput = {
      name: value.name.trim(),
      enabled: value.enabled,
      trigger: { app: value.trigger.app, event: value.trigger.event, config: value.trigger.config },
      action: { app: value.action.app, type: value.action.type, fields: value.action.fields },
    };

    const id = this.id();
    this.saving.set(true);
    (id ? this.zapsApi.update(id, input) : this.zapsApi.create(input)).subscribe({
      next: (zap) => {
        this.saving.set(false);
        this.toast.success(id ? `Saved "${zap.name}"` : `Created "${zap.name}"`);
        void this.router.navigate(['/zaps']);
      },
      error: (err) => {
        this.saving.set(false);
        const unmatched = this.applyServerIssues(apiIssues(err));
        this.formError.set(
          unmatched.length ? unmatched.join(' ') : apiErrorMessage(err, 'Could not save the Zap.'),
        );
      },
    });
  }

  /** Puts server validation messages on the matching controls; returns the ones with no control. */
  private applyServerIssues(issues: { path: string; message: string }[]): string[] {
    const unmatched: string[] = [];
    for (const issue of issues) {
      const control = this.form.get(issue.path);
      if (control) {
        control.setErrors({ ...(control.errors ?? {}), server: issue.message });
        control.markAsTouched();
      } else {
        unmatched.push(issue.message);
      }
    }
    return unmatched;
  }

  // ---- template helpers ----

  /** Repo choices. The saved repo stays selectable even if it no longer appears in the admin list. */
  protected repoOptions(current: string): Pick<Repo, 'fullName' | 'private'>[] {
    const list = this.repos();
    return current && !list.some((r) => r.fullName === current)
      ? [{ fullName: current, private: false }, ...list]
      : list;
  }

  protected control(group: FieldsGroup, key: string): FormControl<string> {
    return group.controls[key]!;
  }

  protected showError(control: AbstractControl | null | undefined): boolean {
    return !!control && control.invalid && control.touched;
  }

  protected errorText(control: AbstractControl | null | undefined, label: string): string {
    const e = control?.errors;
    if (!e) return '';
    if (e['server']) return e['server'];
    if (e['required']) return `${label} is required`;
    if (e['maxlength'])
      return `${label} must be at most ${e['maxlength'].requiredLength} characters`;
    if (e['unknownVariables']) return `Unknown data: ${e['unknownVariables'].join(', ')}`;
    return `${label} is invalid`;
  }

  // ---- internals ----

  private startNew(): void {
    this.form.controls.name.setValue('Thank pull request authors');
    const github = findApp(this.catalog(), 'github');
    if (github?.available) {
      this.pickTriggerApp('github');
      this.pickActionApp('github');
    }
  }

  private populate(zap: Zap): void {
    this.form.controls.name.setValue(zap.name);
    this.form.controls.enabled.setValue(zap.enabled);
    this.pickTriggerApp(zap.trigger.app, zap.trigger.config);
    if (this.triggerEvent() !== zap.trigger.event)
      this.pickTriggerEvent(zap.trigger.event, zap.trigger.config);
    this.pickActionApp(zap.action.app, zap.action.fields);
    if (this.actionType() !== zap.action.type)
      this.pickActionType(zap.action.type, zap.action.fields);
    this.form.markAsPristine();
  }

  /** Replaces a field group's controls with ones for `defs`, keeping values that still apply. */
  private rebuild(
    group: FieldsGroup,
    defs: FieldDef[],
    values: Record<string, string>,
    useDefaults = true,
  ): void {
    for (const key of Object.keys(group.controls)) group.removeControl(key as never);
    for (const def of defs) {
      const validators: ValidatorFn[] = [];
      if (def.required) validators.push(requiredTrimmed);
      if (def.maxLength) validators.push(Validators.maxLength(def.maxLength));
      if (def.type === 'template') validators.push(this.knownVariables);
      const initial = values[def.key] ?? (useDefaults ? (def.defaultValue ?? '') : '');
      group.addControl(
        def.key as never,
        new FormControl(initial, { nonNullable: true, validators }) as never,
      );
    }
  }

  /** Template fields may only use variables the selected trigger provides. */
  private readonly knownVariables: ValidatorFn = (c) => {
    const allowed = new Set(this.variables().map((v) => v.key));
    const unknown = extractVariables(String(c.value ?? '')).filter((v) => !allowed.has(v));
    return unknown.length ? { unknownVariables: unknown.map((v) => `{{${v}}}`) } : null;
  };
}
