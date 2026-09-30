import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Zap, ZapInput } from '../models';

@Injectable({ providedIn: 'root' })
export class ZapsApi {
  private readonly http = inject(HttpClient);

  list(): Observable<Zap[]> {
    return this.http.get<Zap[]>('/api/zaps');
  }

  get(id: string): Observable<Zap> {
    return this.http.get<Zap>(`/api/zaps/${encodeURIComponent(id)}`);
  }

  create(input: ZapInput): Observable<Zap> {
    return this.http.post<Zap>('/api/zaps', input);
  }

  update(id: string, patch: Partial<ZapInput>): Observable<Zap> {
    return this.http.patch<Zap>(`/api/zaps/${encodeURIComponent(id)}`, patch);
  }
}
