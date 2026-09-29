import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, throwError } from 'rxjs';
import { Health } from '../models';

@Injectable({ providedIn: 'root' })
export class HealthApi {
  private readonly http = inject(HttpClient);

  /**
   * Resolves with the health body for both 200 and 503 (503 still means the API answered).
   * Errors only when the API itself cannot be reached.
   */
  get(): Observable<Health> {
    return this.http
      .get<Health>('/api/health')
      .pipe(
        catchError((err: HttpErrorResponse) =>
          err.status === 503 && err.error?.status ? of(err.error as Health) : throwError(() => err),
        ),
      );
  }
}
