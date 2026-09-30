import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { ActionDef, CatalogApp, TriggerDef } from '../models';

/** The catalog changes only with a deploy, so it is fetched once per session and shared. */
@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly http = inject(HttpClient);
  private cached$?: Observable<CatalogApp[]>;

  getCatalog(): Observable<CatalogApp[]> {
    this.cached$ ??= this.http
      .get<CatalogApp[]>('/api/catalog')
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.cached$;
  }
}

export function findApp(catalog: CatalogApp[], appId: string): CatalogApp | undefined {
  return catalog.find((a) => a.id === appId);
}

export function findTrigger(
  catalog: CatalogApp[],
  appId: string,
  id: string,
): TriggerDef | undefined {
  return findApp(catalog, appId)?.triggers.find((t) => t.id === id);
}

export function findAction(
  catalog: CatalogApp[],
  appId: string,
  id: string,
): ActionDef | undefined {
  return findApp(catalog, appId)?.actions.find((a) => a.id === id);
}
