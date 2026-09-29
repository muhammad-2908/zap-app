import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-header',
  imports: [RouterLink],
  template: `
    <header class="app-header">
      <div class="container app-header__inner">
        <a class="brand" routerLink="/zaps">
          <span class="brand__mark" aria-hidden="true">⚡</span>
          Zap App
        </a>
        <!-- M1: signed-in user (avatar, login) and Sign out go here. -->
      </div>
    </header>
  `,
  styles: `
    .app-header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }
    .app-header__inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 56px;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 1.05rem;
      color: var(--text);
      text-decoration: none;
    }
    .brand__mark {
      display: inline-grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: var(--accent);
      color: var(--accent-contrast);
      font-size: 0.9rem;
    }
  `,
})
export class Header {}
