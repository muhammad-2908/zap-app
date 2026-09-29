import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth-service';

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

        @if (auth.user(); as user) {
          <div class="account">
            @if (user.avatarUrl) {
              <img class="avatar" [src]="user.avatarUrl" alt="" width="28" height="28" />
            }
            <span class="account__login">{{ user.login }}</span>
            <button class="btn btn-small" type="button" (click)="signOut()">Sign out</button>
          </div>
        }
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
    .account {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .avatar {
      border-radius: 50%;
      border: 1px solid var(--border);
    }
    .account__login {
      font-weight: 500;
    }
    .btn-small {
      height: 30px;
      padding: 0 10px;
      font-size: 0.85rem;
    }
  `,
})
export class Header {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected signOut(): void {
    this.auth.logout().subscribe({
      complete: () => void this.router.navigate(['/login']),
      error: () => void this.router.navigate(['/login']),
    });
  }
}
