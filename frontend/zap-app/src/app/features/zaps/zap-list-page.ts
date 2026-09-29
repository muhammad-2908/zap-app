import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HealthApi } from '../../core/api/health-api';
import { Health } from '../../core/models';

type StatusView = { kind: 'loading' } | { kind: 'ready'; health: Health } | { kind: 'unreachable' };

/** M0 stub: empty Zap list plus a status card proving Angular -> proxy -> Express -> MongoDB. */
@Component({
  selector: 'app-zap-list-page',
  template: `
    <div class="page-head">
      <h1>Your Zaps</h1>
      <button class="btn btn-primary" type="button" disabled title="The builder arrives in M2">
        Create Zap
      </button>
    </div>

    <div class="card empty">
      <p class="empty__title">No Zaps yet</p>
      <p class="muted">
        When a pull request is opened, comment on it. The builder arrives in milestone M2.
      </p>
    </div>

    <section class="card status" aria-live="polite">
      <div class="status__head">
        <h2>System status</h2>
        <button class="btn" type="button" (click)="load()" [disabled]="view().kind === 'loading'">
          Refresh
        </button>
      </div>

      @switch (view().kind) {
        @case ('loading') {
          <p class="muted">Checking…</p>
        }
        @case ('unreachable') {
          <p>
            <span class="dot dot--bad"></span>API unreachable. Is the backend running on port 3000?
          </p>
        }
        @case ('ready') {
          @if (health(); as h) {
            <dl class="status__grid">
              <dt>API</dt>
              <dd><span class="dot dot--ok"></span>reachable</dd>
              <dt>Database</dt>
              <dd>
                <span
                  class="dot"
                  [class.dot--ok]="h.db === 'connected'"
                  [class.dot--bad]="h.db !== 'connected'"
                ></span>
                {{ h.db }}
              </dd>
              <dt>Uptime</dt>
              <dd>{{ h.uptimeSeconds }}s</dd>
            </dl>
          }
        }
      }
    </section>
  `,
  styles: `
    .page-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 24px 0 16px;
    }
    h1 {
      font-size: 1.5rem;
      margin: 0;
    }
    .empty {
      text-align: center;
      padding: 40px 24px;
    }
    .empty__title {
      font-weight: 600;
      margin: 0 0 4px;
    }
    .empty p {
      margin: 0;
    }
    .status {
      margin-top: 16px;
    }
    .status__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    h2 {
      font-size: 1rem;
      margin: 0;
    }
    .status__grid {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 8px 24px;
      margin: 16px 0 0;
    }
    dt {
      color: var(--text-muted);
    }
    dd {
      margin: 0;
    }
    .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 8px;
      vertical-align: middle;
      background: var(--text-muted);
    }
    .dot--ok {
      background: var(--ok);
    }
    .dot--bad {
      background: var(--danger);
    }
  `,
})
export class ZapListPage implements OnInit {
  private readonly healthApi = inject(HealthApi);

  protected readonly view = signal<StatusView>({ kind: 'loading' });
  protected readonly health = computed(() => {
    const v = this.view();
    return v.kind === 'ready' ? v.health : undefined;
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.view.set({ kind: 'loading' });
    this.healthApi.get().subscribe({
      next: (health) => this.view.set({ kind: 'ready', health }),
      error: () => this.view.set({ kind: 'unreachable' }),
    });
  }
}
