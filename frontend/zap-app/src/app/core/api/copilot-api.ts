import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CopilotDraft } from '../models';

@Injectable({ providedIn: 'root' })
export class CopilotApi {
  private readonly http = inject(HttpClient);

  draft(prompt: string): Observable<CopilotDraft> {
    return this.http.post<CopilotDraft>('/api/copilot/draft', { prompt });
  }
}
