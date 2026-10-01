import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { apiErrorMessage } from '../../core/api/api-errors';
import { CopilotApi } from '../../core/api/copilot-api';
import { DraftStore } from './draft-store';

const EXAMPLES = [
  'When a pull request is opened, comment thanks.',
  'When a PR is opened, comment "We will review this within 2 working days."',
];

/** Describe an automation in plain English; opens the builder with a draft to review. */
@Component({
  selector: 'app-copilot-panel',
  imports: [ReactiveFormsModule],
  template: `
    <section class="card copilot" aria-labelledby="copilot-title">
      <div class="copilot__head">
        <h2 id="copilot-title">Copilot</h2>
        <span class="muted">Describe a Zap; you review it before anything runs.</span>
      </div>
      <form class="copilot__form" (submit)="$event.preventDefault(); submit()">
        <input
          class="input"
          [formControl]="prompt"
          placeholder="When a pull request is opened, comment thanks."
          aria-label="Describe the automation"
          maxlength="500"
        />
        <button class="btn btn-primary" type="submit" [disabled]="busy()">
          {{ busy() ? 'Drafting…' : 'Draft Zap' }}
        </button>
      </form>
      <div class="copilot__examples">
        <span class="muted">Try:</span>
        @for (example of examples; track example) {
          <button type="button" class="chip" (click)="useExample(example)">{{ example }}</button>
        }
      </div>
      @if (error(); as message) {
        <p class="error-text" role="alert">{{ message }}</p>
      }
    </section>
  `,
  styles: `
    .copilot {
      margin-bottom: 16px;
    }
    .copilot__head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 12px;
    }
    h2 {
      font-size: 1rem;
      margin: 0;
    }
    .copilot__head span {
      font-size: 0.85rem;
    }
    .copilot__form {
      display: flex;
      gap: 8px;
    }
    .copilot__form .input {
      flex: 1;
    }
    .copilot__examples {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-top: 10px;
      font-size: 0.85rem;
    }
    .chip {
      padding: 2px 10px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
      font: inherit;
      cursor: pointer;
    }
    @media (max-width: 600px) {
      .copilot__form {
        flex-direction: column;
      }
    }
  `,
})
export class CopilotPanel {
  private readonly api = inject(CopilotApi);
  private readonly store = inject(DraftStore);
  private readonly router = inject(Router);

  protected readonly examples = EXAMPLES;
  protected readonly prompt = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(5)],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected useExample(text: string): void {
    this.prompt.setValue(text);
    this.submit();
  }

  protected submit(): void {
    const text = this.prompt.value.trim();
    if (text.length < 5) {
      this.error.set('Describe the automation in a few words.');
      return;
    }
    this.error.set(null);
    this.busy.set(true);
    this.api.draft(text).subscribe({
      next: (draft) => {
        this.busy.set(false);
        this.store.set(draft);
        void this.router.navigate(['/zaps/new'], { queryParams: { from: 'copilot' } });
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, 'The Copilot could not draft that. Try rephrasing.'));
      },
    });
  }
}
