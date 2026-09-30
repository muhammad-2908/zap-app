import { Component, input, output } from '@angular/core';
import { CatalogApp } from '../../../core/models';

/** Grid of apps from the catalog. Apps that aren't available yet are shown but can't be picked. */
@Component({
  selector: 'app-app-picker',
  template: `
    <div class="grid" role="radiogroup" [attr.aria-label]="label()">
      @for (app of apps(); track app.id) {
        <button
          type="button"
          class="app"
          role="radio"
          [class.app--selected]="app.id === selected()"
          [attr.aria-checked]="app.id === selected()"
          [disabled]="!app.available"
          [attr.title]="app.available ? app.description : app.name + ' is coming soon'"
          (click)="picked.emit(app.id)"
        >
          <span class="app__logo" [attr.data-app]="app.id" aria-hidden="true">{{
            app.name.charAt(0)
          }}</span>
          <span class="app__name">{{ app.name }}</span>
          @if (!app.available) {
            <span class="app__badge">Coming soon</span>
          }
        </button>
      }
    </div>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 8px;
    }
    .app {
      display: grid;
      justify-items: center;
      gap: 6px;
      padding: 14px 8px 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
      color: var(--text);
      font: inherit;
      cursor: pointer;
    }
    .app:hover:not(:disabled) {
      border-color: var(--text-muted);
    }
    .app:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .app--selected {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent) inset;
    }
    .app:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
    .app__logo {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      font-weight: 700;
      color: #fff;
      background: #6b7280;
    }
    .app__logo[data-app='github'] {
      background: #24292f;
    }
    .app__logo[data-app='gitlab'] {
      background: #fc6d26;
    }
    .app__logo[data-app='bitbucket'] {
      background: #2684ff;
    }
    .app__logo[data-app='jira'] {
      background: #0052cc;
    }
    .app__logo[data-app='slack'] {
      background: #4a154b;
    }
    .app__logo[data-app='linear'] {
      background: #5e6ad2;
    }
    .app__name {
      font-weight: 500;
    }
    .app__badge {
      font-size: 0.7rem;
      padding: 1px 6px;
      border-radius: 999px;
      background: var(--border);
      color: var(--text-muted);
    }
  `,
})
export class AppPicker {
  readonly apps = input.required<CatalogApp[]>();
  readonly selected = input<string>('');
  readonly label = input<string>('Choose an app');
  readonly picked = output<string>();
}
