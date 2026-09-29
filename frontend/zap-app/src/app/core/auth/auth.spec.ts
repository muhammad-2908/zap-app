import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { User } from '../models';
import { authGuard, guestGuard } from './auth-guards';
import { AuthService } from './auth-service';

const USER: User = {
  id: 'u1',
  githubId: 1,
  login: 'octocat',
  name: null,
  avatarUrl: null,
  tokenStatus: 'valid',
};

describe('auth', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  const run = (guard: typeof authGuard) =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the signed-in user from /api/auth/me', async () => {
    const done = auth.loadMe();
    http.expectOne('/api/auth/me').flush(USER);
    await done;
    expect(auth.user()?.login).toBe('octocat');
    expect(auth.isSignedIn()).toBe(true);
  });

  it('treats a 401 from /me as signed out', async () => {
    const done = auth.loadMe();
    http.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    await done;
    expect(auth.isSignedIn()).toBe(false);
  });

  it('authGuard sends signed-out users to /login', () => {
    const result = run(authGuard) as UrlTree;
    expect(result.toString()).toBe('/login');
  });

  it('authGuard lets signed-in users through, guestGuard sends them to /zaps', async () => {
    const done = auth.loadMe();
    http.expectOne('/api/auth/me').flush(USER);
    await done;
    expect(run(authGuard)).toBe(true);
    expect((run(guestGuard) as UrlTree).toString()).toBe('/zaps');
  });

  it('logout calls the API and clears the user', async () => {
    const done = auth.loadMe();
    http.expectOne('/api/auth/me').flush(USER);
    await done;

    auth.logout().subscribe();
    const req = http.expectOne('/api/auth/logout');
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(auth.isSignedIn()).toBe(false);
  });
});
