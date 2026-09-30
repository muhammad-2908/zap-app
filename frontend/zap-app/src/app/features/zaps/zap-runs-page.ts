import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { apiErrorMessage } from '../../core/api/api-errors';
import { ZapsApi } from '../../core/api/zaps-api';
import { Zap, ZapRun } from '../../core/models';
import { relativeTime } from './relative-time';

/** /zaps/:id/runs — the last 20 runs of one Zap: when, which PR, and the comment or the error. */
@Component({
  selector: 'app-zap-runs-page',
  imports: [RouterLink, DatePipe],
  templateUrl: './zap-runs-page.html',
  styleUrl: './zap-runs-page.scss',
})
export class ZapRunsPage implements OnInit {
  readonly id = input.required<string>();

  private readonly zapsApi = inject(ZapsApi);

  protected readonly state = signal<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  protected readonly error = signal('');
  protected readonly zap = signal<Zap | null>(null);
  protected readonly runs = signal<ZapRun[]>([]);
  protected readonly relativeTime = relativeTime;

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    forkJoin({ zap: this.zapsApi.get(this.id()), runs: this.zapsApi.runs(this.id()) }).subscribe({
      next: ({ zap, runs }) => {
        this.zap.set(zap);
        this.runs.set(runs);
        this.state.set('ready');
      },
      error: (err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 404) {
          this.state.set('not-found');
          return;
        }
        this.error.set(apiErrorMessage(err, 'Could not load the run history.'));
        this.state.set('error');
      },
    });
  }
}
