import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth-guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'zaps' },
  {
    path: 'login',
    title: 'Sign in · Zap App',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'zaps',
    title: 'Zaps · Zap App',
    canActivate: [authGuard],
    loadComponent: () => import('./features/zaps/zap-list-page').then((m) => m.ZapListPage),
  },
  {
    path: 'zaps/new',
    title: 'Create Zap · Zap App',
    canActivate: [authGuard],
    loadComponent: () => import('./features/zaps/zap-builder-page').then((m) => m.ZapBuilderPage),
  },
  {
    path: 'zaps/:id',
    title: 'Edit Zap · Zap App',
    canActivate: [authGuard],
    loadComponent: () => import('./features/zaps/zap-builder-page').then((m) => m.ZapBuilderPage),
  },
  { path: '**', redirectTo: 'zaps' },
];
