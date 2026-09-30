import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ZapRunsPage } from './zap-runs-page';

describe('ZapRunsPage', () => {
  let http: HttpTestingController;

  function create() {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ZapRunsPage);
    fixture.componentRef.setInput('id', 'z1');
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('shows the comment for successful runs and the reason for failed ones', async () => {
    const fixture = create();
    http.expectOne('/api/zaps/z1').flush({ id: 'z1', name: 'Thank PR authors', enabled: true });
    http.expectOne('/api/zaps/z1/runs').flush([
      {
        id: 'r2',
        status: 'failed',
        repoFullName: 'me/zap-test',
        prNumber: 8,
        prUrl: 'https://github.com/me/zap-test/pull/8',
        commentUrl: null,
        renderedBody: null,
        error: { code: 'github_forbidden', message: 'GitHub refused the comment: Not Found' },
        durationMs: 120,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'r1',
        status: 'success',
        repoFullName: 'me/zap-test',
        prNumber: 7,
        prUrl: 'https://github.com/me/zap-test/pull/7',
        commentUrl: 'https://github.com/me/zap-test/pull/7#issuecomment-1',
        renderedBody: 'Thanks @bob!',
        error: null,
        durationMs: 300,
        createdAt: new Date().toISOString(),
      },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const items = el.querySelectorAll('.run');
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain('GitHub refused the comment');
    expect(items[1]!.textContent).toContain('Thanks @bob!');
    expect(items[1]!.querySelector('a.run__link')?.getAttribute('href')).toContain(
      'issuecomment-1',
    );
  });

  it('shows "not found" for a Zap the user does not own', async () => {
    const fixture = create();
    // Both calls 404 for a foreign Zap (the first error may cancel the other request).
    for (const req of http.match(() => true)) {
      if (!req.cancelled) {
        req.flush({ error: { code: 'zap_not_found' } }, { status: 404, statusText: 'Not Found' });
      }
    }
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Zap not found');
  });
});
