import { Component } from '@angular/core';

/** M0 stub. M1 turns the button into a link to /api/auth/github. */
@Component({
  selector: 'app-login-page',
  template: `
    <section class="login card">
      <h1>Automate your pull requests</h1>
      <p class="muted">Build Zaps that react to GitHub events. Sign in to get started.</p>
      <button class="btn btn-primary" type="button" disabled title="GitHub sign-in arrives in M1">
        Sign in with GitHub
      </button>
    </section>
  `,
  styles: `
    .login {
      max-width: 420px;
      margin: 64px auto;
      text-align: center;
      display: grid;
      gap: 12px;
    }
    h1 {
      font-size: 1.4rem;
      margin: 0;
    }
    p {
      margin: 0 0 8px;
    }
  `,
})
export class LoginPage {}
