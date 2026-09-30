import { HttpErrorResponse } from '@angular/common/http';
import { ApiIssue } from '../models';

/** Human message for any failed API call. */
export function apiErrorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Cannot reach the server. Is the API running?';
    const message = err.error?.error?.message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

/** Field-level issues from a 400 validation_error, if any. */
export function apiIssues(err: unknown): ApiIssue[] {
  if (err instanceof HttpErrorResponse && err.error?.error?.code === 'validation_error') {
    const details = err.error.error.details;
    if (Array.isArray(details)) {
      return details.filter(
        (d): d is ApiIssue => typeof d?.path === 'string' && typeof d?.message === 'string',
      );
    }
  }
  return [];
}
