import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { apiErrorMessage } from '../../core/api/api-errors';
import { CatalogApi, findAction, findApp, findTrigger } from '../../core/api/catalog-api';
import { HealthApi } from '../../core/api/health-api';
import { ZapsApi } from '../../core/api/zaps-api';
import { CatalogApp, Health, Zap } from '../../core/models';
import { ToastService } from '../../core/ui/toast-service';
import { StatusToggle } from './components/status-toggle';
import { relativeTime } from './relative-time';

/** /zaps — the signed-in user's Zaps with on/off toggles. */
@Component({
  selector: 'app-zap-list-page',
  imports: [RouterLink, StatusToggle],
  templateUrl: './zap-list-page.html',
  styleUrl: './zap-list-page.scss',
})
export class ZapListPage implements OnInit {
  private readonly zapsApi = inject(ZapsApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly healthApi = inject(HealthApi);
  private readonly toast = inject(ToastService);

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly error = signal('');
  protected readonly zaps = signal<Zap[]>([]);
  protected readonly catalog = signal<CatalogApp[]>([]);
  /** Ids of Zaps whose toggle request is in flight. */
  protected readonly toggling = signal<ReadonlySet<string>>(new Set());
  protected readonly health = signal<Health | null>(null);

  ngOnInit(): void {
    this.load();
    this.healthApi
      .get()
      .subscribe({ next: (h) => this.health.set(h), error: () => this.health.set(null) });
  }

  protected load(): void {
    this.state.set('loading');
    forkJoin({ zaps: this.zapsApi.list(), catalog: this.catalogApi.getCatalog() }).subscribe({
      next: ({ zaps, catalog }) => {
        this.zaps.set(zaps);
        this.catalog.set(catalog);
        this.state.set('ready');
      },
      error: (err) => {
        this.error.set(apiErrorMessage(err, 'Could not load your Zaps.'));
        this.state.set('error');
      },
    });
  }

  /** Optimistic: flip immediately, revert and explain if the API refuses. */
  protected toggle(zap: Zap, enabled: boolean): void {
    this.setToggling(zap.id, true);
    this.replace({ ...zap, enabled });
    this.zapsApi.update(zap.id, { enabled }).subscribe({
      next: (saved) => {
        this.replace(saved);
        this.setToggling(zap.id, false);
        this.toast.success(`"${saved.name}" is ${saved.enabled ? 'on' : 'off'}`);
      },
      error: (err) => {
        this.replace(zap);
        this.setToggling(zap.id, false);
        this.toast.error(apiErrorMessage(err, 'Could not change the Zap status.'));
      },
    });
  }

  protected triggerSummary(zap: Zap): string {
    const app = findApp(this.catalog(), zap.trigger.app)?.name ?? zap.trigger.app;
    const event =
      findTrigger(this.catalog(), zap.trigger.app, zap.trigger.event)?.name ?? zap.trigger.event;
    const repo = zap.trigger.config['repoFullName'];
    return [app, event, repo].filter(Boolean).join(' · ');
  }

  protected actionSummary(zap: Zap): string {
    const app = findApp(this.catalog(), zap.action.app)?.name ?? zap.action.app;
    const action =
      findAction(this.catalog(), zap.action.app, zap.action.type)?.name ?? zap.action.type;
    return `${app} · ${action}`;
  }

  protected lastRun(zap: Zap): string {
    if (!zap.lastRunAt) return 'Never run';
    const outcome = zap.lastRunStatus === 'failed' ? 'Failed' : 'Ran';
    return `${outcome} ${relativeTime(zap.lastRunAt)}`;
  }

  private replace(zap: Zap): void {
    this.zaps.update((list) => list.map((z) => (z.id === zap.id ? zap : z)));
  }

  private setToggling(id: string, on: boolean): void {
    this.toggling.update((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
