import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Repo } from '../models';

@Injectable({ providedIn: 'root' })
export class GithubApi {
  private readonly http = inject(HttpClient);

  /** Repos the user administers (webhooks need admin). `fresh` bypasses the 60s server cache. */
  repos(fresh = false): Observable<Repo[]> {
    const params = fresh ? new HttpParams().set('fresh', '1') : undefined;
    return this.http.get<Repo[]>('/api/github/repos', { params });
  }
}
