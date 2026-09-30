import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CatalogApp } from '../../core/models';
import { ZapBuilderPage } from './zap-builder-page';

const CATALOG: CatalogApp[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: '',
    available: true,
    triggers: [
      {
        id: 'pull_request.opened',
        name: 'Pull request opened',
        description: '',
        configFields: [{ key: 'repoFullName', label: 'Repository', type: 'repo', required: true }],
        variables: [{ key: 'pr.author', label: 'PR author', sample: 'octocat' }],
      },
    ],
    actions: [
      {
        id: 'pull_request.comment',
        name: 'Comment on pull request',
        description: '',
        fields: [
          {
            key: 'body',
            label: 'Comment',
            type: 'template',
            required: true,
            defaultValue: 'Thanks @{{pr.author}}!',
          },
        ],
      },
    ],
  },
  { id: 'slack', name: 'Slack', description: '', available: false, triggers: [], actions: [] },
];

describe('ZapBuilderPage (create)', () => {
  let http: HttpTestingController;

  async function setup() {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ZapBuilderPage);
    fixture.detectChanges();
    http.expectOne('/api/catalog').flush(CATALOG);
    http.expectOne('/api/github/repos').flush([{ fullName: 'me/zap-test', private: false }]);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('preselects GitHub, the only trigger/action, and the default comment', async () => {
    const fixture = await setup();
    const form = (fixture.componentInstance as unknown as { form: ZapBuilderPage['form'] }).form;
    const value = form.getRawValue();
    expect(value.trigger).toEqual({
      app: 'github',
      event: 'pull_request.opened',
      config: { repoFullName: '' },
    });
    expect(value.action).toEqual({
      app: 'github',
      type: 'pull_request.comment',
      fields: { body: 'Thanks @{{pr.author}}!' },
    });
    expect(value.enabled).toBe(false);
  });

  it('blocks save until a repository is chosen, and rejects unknown template data', async () => {
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    const page = fixture.componentInstance as unknown as {
      form: ZapBuilderPage['form'];
      save(): void;
    };

    page.form.controls.action.controls.fields.controls['body']!.setValue('Hi {{issue.title}}');
    page.save();
    fixture.detectChanges();
    const errors = Array.from(el.querySelectorAll('.error-text')).map((e) => e.textContent?.trim());
    expect(errors).toContain('Repository is required');
    expect(errors).toContain('Unknown data: {{issue.title}}');
    http.expectNone('/api/zaps');
  });

  it('posts the Zap and shows server field errors on the right control', async () => {
    const fixture = await setup();
    const page = fixture.componentInstance as unknown as {
      form: ZapBuilderPage['form'];
      save(): void;
    };
    page.form.controls.trigger.controls.config.controls['repoFullName']!.setValue('me/zap-test');
    page.save();

    const req = http.expectOne('/api/zaps');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({
      name: 'Thank pull request authors',
      enabled: false,
      trigger: {
        app: 'github',
        event: 'pull_request.opened',
        config: { repoFullName: 'me/zap-test' },
      },
    });
    req.flush(
      {
        error: {
          code: 'validation_error',
          message: 'x',
          details: [{ path: 'name', message: 'Name is taken' }],
        },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();
    expect(page.form.controls.name.errors).toEqual({ server: 'Name is taken' });
  });

  it('navigates back to the list after a successful save', async () => {
    const fixture = await setup();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const page = fixture.componentInstance as unknown as {
      form: ZapBuilderPage['form'];
      save(): void;
    };
    page.form.controls.trigger.controls.config.controls['repoFullName']!.setValue('me/zap-test');
    page.save();
    http.expectOne('/api/zaps').flush({ id: '1', name: 'Thank pull request authors' });
    expect(navigate).toHaveBeenCalledWith(['/zaps']);
  });
});
