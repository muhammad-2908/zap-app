import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHost } from './core/ui/toast-host';
import { Header } from './shared/header/header';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, ToastHost],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
