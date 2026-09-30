import { Component, input, output } from '@angular/core';

/** On/Off switch. Presentational: the parent decides what a change means. */
@Component({
  selector: 'app-status-toggle',
  template: `
    <button
      type="button"
      class="switch"
      role="switch"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="label()"
      [disabled]="disabled()"
      (click)="changed.emit(!checked())"
    >
      <span class="switch__track"><span class="switch__thumb"></span></span>
      <span class="switch__text">{{ checked() ? 'On' : 'Off' }}</span>
    </button>
  `,
  styles: `
    .switch {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: none;
      border: 0;
      padding: 4px 0;
      font: inherit;
      color: var(--text);
      cursor: pointer;
    }
    .switch:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .switch:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
      border-radius: 6px;
    }
    .switch__track {
      position: relative;
      width: 36px;
      height: 20px;
      border-radius: 999px;
      background: var(--border);
      transition: background 0.15s;
    }
    .switch__thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
      transition: transform 0.15s;
    }
    [aria-checked='true'] .switch__track {
      background: var(--ok);
    }
    [aria-checked='true'] .switch__thumb {
      transform: translateX(16px);
    }
    .switch__text {
      min-width: 24px;
      font-weight: 500;
      font-size: 0.9rem;
    }
  `,
})
export class StatusToggle {
  readonly checked = input(false);
  readonly disabled = input(false);
  readonly label = input('Zap status');
  readonly changed = output<boolean>();
}
