import { TestBed } from '@angular/core/testing';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  it('links the button to the API sign-in route', () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector('a.btn-primary');
    expect(link?.getAttribute('href')).toBe('/api/auth/github');
  });

  it('shows a readable message for ?error=denied', () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.componentRef.setInput('error', 'denied');
    fixture.detectChanges();
    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('cancelled');
  });

  it('shows no message without an error', () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeNull();
  });
});
