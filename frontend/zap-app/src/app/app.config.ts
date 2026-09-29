import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth-service';
import { authInterceptor } from './core/http/auth-interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // All API calls go to /api on the same origin; the dev server proxies them to Express.
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    // Know who is signed in before the first route guard runs.
    provideAppInitializer(() => inject(AuthService).loadMe()),
  ],
};
