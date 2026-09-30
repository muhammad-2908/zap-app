import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth-service';

/**
 * A 401 from any API call means the session ended, or GitHub no longer accepts the stored token.
 * Either way: forget the user and go to /login with a reason. The startup /me check is excluded
 * because 401 there is the normal "signed out" answer.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        !req.url.endsWith('/api/auth/me')
      ) {
        const reason = err.error?.error?.code === 'github_reauth_required' ? 'reauth' : 'expired';
        auth.clear();
        void router.navigate(['/login'], { queryParams: { error: reason } });
      }
      return throwError(() => err);
    }),
  );
};
