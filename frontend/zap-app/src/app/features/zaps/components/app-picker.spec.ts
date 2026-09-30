import { TestBed } from '@angular/core/testing';
import { CatalogApp } from '../../../core/models';
import { AppPicker } from './app-picker';

const apps: CatalogApp[] = [
  { id: 'github', name: 'GitHub', description: '', available: true, triggers: [], actions: [] },
  { id: 'slack', name: 'Slack', description: '', available: false, triggers: [], actions: [] },
];

describe('AppPicker', () => {
  it('disables coming-soon apps and emits picks for available ones', () => {
    const fixture = TestBed.createComponent(AppPicker);
    fixture.componentRef.setInput('apps', apps);
    fixture.componentRef.setInput('selected', 'github');
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((id) => picked.push(id));
    fixture.detectChanges();

    const [github, slack] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        'button[role=radio]',
      ),
    );
    expect(github!.getAttribute('aria-checked')).toBe('true');
    expect(slack!.disabled).toBe(true);
    expect(slack!.textContent).toContain('Coming soon');

    github!.click();
    expect(picked).toEqual(['github']);
  });
});
