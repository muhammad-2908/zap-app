import { Component, ElementRef, input, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { FieldDef, VariableDef } from '../../../core/models';
import { renderWithValues } from '../../../core/template';

/** Textarea for a template field, with "insert data" chips and a live preview using sample values. */
@Component({
  selector: 'app-template-field',
  imports: [ReactiveFormsModule],
  template: `
    <label class="label" [attr.for]="inputId()">{{ field().label }}</label>
    <textarea
      #box
      class="input"
      rows="4"
      [id]="inputId()"
      [formControl]="control()"
      [attr.placeholder]="field().placeholder ?? null"
      [attr.maxlength]="field().maxLength ?? null"
      [attr.aria-invalid]="control().invalid && control().touched"
    ></textarea>

    @if (variables().length) {
      <div class="chips" aria-label="Insert pull request data">
        <span class="muted chips__label">Insert:</span>
        @for (v of variables(); track v.key) {
          <button type="button" class="chip" [title]="token(v.key)" (click)="insert(v.key)">
            {{ v.label }}
          </button>
        }
      </div>
    }

    @if (field().help) {
      <p class="help muted">{{ field().help }}</p>
    }

    @if (control().value) {
      <div class="preview">
        <span class="preview__label muted">Preview with sample data</span>
        <p class="preview__text">{{ preview() }}</p>
      </div>
    }
  `,
  styles: `
    .chips {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
    }
    .chips__label {
      font-size: 0.85rem;
    }
    .chip {
      padding: 2px 10px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .chip:hover {
      border-color: var(--text-muted);
    }
    .help {
      margin: 8px 0 0;
      font-size: 0.85rem;
    }
    .preview {
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px dashed var(--border);
    }
    .preview__label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .preview__text {
      margin: 4px 0 0;
      white-space: pre-wrap;
      word-break: break-word;
    }
  `,
})
export class TemplateField {
  readonly field = input.required<FieldDef>();
  readonly control = input.required<FormControl<string>>();
  readonly variables = input<VariableDef[]>([]);
  readonly inputId = input('template-field');

  private readonly box = viewChild.required<ElementRef<HTMLTextAreaElement>>('box');

  protected token(key: string): string {
    return `{{${key}}}`;
  }

  protected preview(): string {
    const samples = Object.fromEntries(this.variables().map((v) => [v.key, v.sample]));
    return renderWithValues(this.control().value ?? '', samples);
  }

  /** Inserts {{key}} at the cursor (or replaces the selection) and keeps focus in the textarea. */
  protected insert(key: string): void {
    const el = this.box().nativeElement;
    const token = this.token(key);
    const value = this.control().value ?? '';
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    this.control().setValue(value.slice(0, start) + token + value.slice(end));
    this.control().markAsDirty();
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }
}
