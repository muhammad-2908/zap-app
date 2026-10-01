import { Injectable, signal } from '@angular/core';
import { CopilotDraft } from '../../core/models';

/** Hands a Copilot draft from the list page to the builder. In memory only: a refresh drops it. */
@Injectable({ providedIn: 'root' })
export class DraftStore {
  private readonly current = signal<CopilotDraft | null>(null);

  set(draft: CopilotDraft): void {
    this.current.set(draft);
  }

  /** Returns the draft once and clears it, so a later "Create Zap" starts empty. */
  take(): CopilotDraft | null {
    const draft = this.current();
    this.current.set(null);
    return draft;
  }
}
