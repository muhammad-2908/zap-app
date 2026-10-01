import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CopilotPanel } from './copilot-panel';
import { DraftStore } from './draft-store';

describe('CopilotPanel', () => {
  let http: HttpTestingController;

  function create() {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CopilotPanel);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('sends the prompt, stores the draft and opens the builder', () => {
    const fixture = create();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const el = fixture.nativeElement as HTMLElement;

    (el.querySelector('button.chip') as HTMLButtonElement).click();
    const req = http.expectOne('/api/copilot/draft');
    expect(req.request.body).toEqual({ prompt: 'When a pull request is opened, comment thanks.' });
    const draft = { draft: { name: 'x' }, warnings: [], mode: 'rules' };
    req.flush(draft);

    expect(navigate).toHaveBeenCalledWith(['/zaps/new'], { queryParams: { from: 'copilot' } });
    expect(TestBed.inject(DraftStore).take()).toEqual(draft);
  });

  it("shows the server's explanation for unsupported requests", () => {
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = 'When a PR is opened, post to Slack';
    input.dispatchEvent(new Event('input'));
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    http
      .expectOne('/api/copilot/draft')
      .flush(
        { error: { code: 'copilot_unsupported', message: 'Slack is not available yet.' } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Slack is not available yet.',
    );
  });
});
