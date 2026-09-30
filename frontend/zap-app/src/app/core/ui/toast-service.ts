import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'success' | 'error';
  text: string;
}

/** Short, non-blocking messages ("Zap saved"). Rendered by <app-toast-host>. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  success(text: string): void {
    this.push('success', text);
  }

  error(text: string): void {
    this.push('error', text, 6000);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(kind: Toast['kind'], text: string, ms = 3500): void {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, kind, text }]);
    setTimeout(() => this.dismiss(id), ms);
  }
}
