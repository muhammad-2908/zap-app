import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, firstValueFrom, map } from 'rxjs';
import { User } from '../models';

/** Holds the signed-in user. The session itself lives in an httpOnly cookie the app never reads. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly currentUser = signal<User | null>(null);

  readonly user = this.currentUser.asReadonly();
  readonly isSignedIn = computed(() => this.currentUser() !== null);

  /** Called once at startup: asks the API who the cookie belongs to. 401 simply means signed out. */
  async loadMe(): Promise<void> {
    try {
      this.currentUser.set(await firstValueFrom(this.http.get<User>('/api/auth/me')));
    } catch {
      this.currentUser.set(null);
    }
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', null).pipe(
      map(() => undefined),
      finalize(() => this.clear()),
    );
  }

  /** Forget the user locally (after logout, or when the API says the session is gone). */
  clear(): void {
    this.currentUser.set(null);
  }
}
