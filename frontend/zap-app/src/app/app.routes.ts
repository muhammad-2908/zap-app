import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'zaps' },
  {
    path: 'login',
    title: 'Sign in · Zap App',
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'zaps',
    title: 'Zaps · Zap App',
    loadComponent: () => import('./features/zaps/zap-list-page').then((m) => m.ZapListPage),
  },
  { path: '**', redirectTo: 'zaps' },
];
