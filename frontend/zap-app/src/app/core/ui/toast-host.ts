import { Component, inject } from '@angular/core';
import { ToastService } from './toast-service';

@Component({
  selector: 'app-toast-host',
  template: `
    <div class="toasts" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class.toast--error]="t.kind === 'error'" role="status">
          <span>{{ t.text }}</span>
          <button type="button" aria-label="Dismiss" (click)="toast.dismiss(t.id)">×</button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts {
      position: fixed;
      right: 16px;
      bottom: 16px;
      display: grid;
      gap: 8px;
      z-index: 50;
      max-width: min(420px, calc(100vw - 32px));
    }
    .toast {
      display: flex;
      align-items: center;
      gap: 12px;
      justify-content: space-between;
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--text);
      color: var(--surface);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    }
    .toast--error {
      background: var(--danger);
      color: #fff;
    }
    button {
      background: none;
      border: 0;
      color: inherit;
      font-size: 1.1rem;
      cursor: pointer;
    }
  `,
})
export class ToastHost {
  protected readonly toast = inject(ToastService);
}
