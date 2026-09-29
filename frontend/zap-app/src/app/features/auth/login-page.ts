import { Component, computed, input } from '@angular/core';

const ERROR_MESSAGES: Record<string, string> = {
  denied: 'GitHub sign-in was cancelled.',
  state: 'Your sign-in link expired. Please try again.',
  github: 'GitHub could not complete the sign-in. Please try again in a moment.',
  expired: 'Your session has ended. Please sign in again.',
};

@Component({
  selector: 'app-login-page',
  template: `
    <section class="login card">
      <h1>Automate your pull requests</h1>
      <p class="muted">Build Zaps that react to GitHub events. Sign in to get started.</p>

      @if (errorMessage(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      <!-- A full page navigation, not an XHR: the API redirects the browser to GitHub. -->
      <a class="btn btn-primary btn-github" href="/api/auth/github">
        <svg aria-hidden="true" viewBox="0 0 16 16" width="18" height="18">
          <path
            fill="currentColor"
            d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
          />
        </svg>
        Sign in with GitHub
      </a>
      <p class="fine-print muted">
        We ask for access to your repositories so Zaps can install webhooks and comment on pull
        requests. Your GitHub token stays on the server.
      </p>
    </section>
  `,
  styles: `
    .login {
      max-width: 440px;
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
      margin: 0;
    }
    .btn-github {
      margin-top: 8px;
      height: 42px;
    }
    .alert {
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--danger-soft);
      color: var(--danger);
      text-align: left;
    }
    .fine-print {
      font-size: 0.8rem;
    }
  `,
})
export class LoginPage {
  /** Bound from the ?error= query param (router input binding). */
  readonly error = input<string>();

  protected readonly errorMessage = computed(() => {
    const code = this.error();
    return code ? (ERROR_MESSAGES[code] ?? 'Sign-in failed. Please try again.') : null;
  });
}
