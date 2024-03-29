/*
Copyright (c) 2020-2024 CRS4

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';

import { BehaviorSubject, from, Observable, Subject, Subscription } from 'rxjs';
import { Job } from 'src/app/models/job.model';
import { Logger, LoggerManager } from '../../logging';
import { ApiSocket } from '../../shared/api-socket';
import { AuthService } from '../auth.service';
import { AppConfigService } from '../config.service';
import { InputDialogService } from '../input-dialog.service';
import {
  CachedRequest,
  CachedRequestInit,
  CachedResponse,
  CacheManager,
} from './cache-manager';
import { CacheRefreshStatus } from './cache.model';

declare var $: any;

// Reference to subject worker: always notify the last inizialited worker
const workerSubject = new BehaviorSubject<Worker>(null);

// initialize logger
const _logger = LoggerManager.create('WorkerLogger');

// reference to the active cache worker
let worker: Worker = null;
if (typeof Worker !== 'undefined') {
  // Create a new
  worker = new Worker(new URL('./cache.worker', import.meta.url));
  worker.onmessage = ({ data }) => {
    _logger.debug(`page got message: ${data}`);
  };
  workerSubject.next(worker);
  worker.postMessage({ type: 'ping' });
} else {
  // Web Workers are not supported in this environment.
  // You should add a fallback so that your program still executes correctly.
  _logger.warn('Workers are not supported on this environment');
}

@Injectable({
  providedIn: 'root',
})
export class CachedHttpClientService {
  private apiBaseUrl: string = null;
  private syncInterval: number = 5 * 60 * 1000;
  private httpOptions: object = null;

  private jobSubject: Subject<Job> = new Subject<Job>();

  // initialize logger
  private logger: Logger = LoggerManager.create('CachedHttpClient');

  private workflowVersionCreatedSubject: Subject<{
    uuid: string;
    version: string;
  }> = new Subject<{ uuid: string; version: string }>();
  public onWorkflowVersionCreated: Observable<{
    uuid: string;
    version: string;
  }> = this.workflowVersionCreatedSubject.asObservable();

  private workflowVersionUpdateSubject: Subject<{
    uuid: string;
    version: string;
  }> = new Subject<{ uuid: string; version: string }>();
  public onWorkflowVersionUpdate: Observable<{
    uuid: string;
    version: string;
  }> = this.workflowVersionUpdateSubject.asObservable();

  private workflowVersionDeleteSubject: Subject<{
    uuid: string;
    version: string;
  }> = new Subject<{ uuid: string; version: string }>();
  public onWorkflowVersionDeleted: Observable<{
    uuid: string;
    version: string;
  }> = this.workflowVersionDeleteSubject.asObservable();

  private initSubject: Subject<boolean> = new BehaviorSubject<boolean>(false);
  private subscription: Subscription;
  private _cache: CacheManager = new CacheManager('api:lm');

  private _skipInitialSync: boolean = false;

  private worker: Worker;
  private socket: ApiSocket;
  isOnline: boolean;

  constructor(
    private http: HttpClient,
    private config: AppConfigService,
    private dialog: InputDialogService,
    private authService: AuthService // private socket: ApiSocketService
  ) {
    // this.syncInterval = Number(this.config.getConfig()['syncInterval']);
  }

  public init() {
    this.apiBaseUrl = this.config.apiBaseUrl;
    // alert(`API Service created: ${this.apiBaseUrl}`);
    this.logger.debug(`API Service created: ${this.apiBaseUrl}`);

    this.cache.isEmpty().then((empty) => {
      this._skipInitialSync = empty;
    });

    this.cache.getEntries().then((value) => {
      this.logger.debug('Current groups', value);
    });

    this.config.onLoad.subscribe((loaded) => {
      if (loaded) {
        workerSubject.subscribe((worker: Worker) => {
          this.logger.debug('Worker', worker);
        });
      }
    });

    // setup network listener
    this.setUpWorkerMessageHandler(worker);
    this.socket = new ApiSocket(this.config, this, worker);
    this.socket.connect();

    this.cache.onCacheEntryUpdated = (
      request: CachedRequest,
      response: CachedResponse
    ) => {
      this.logger.debug('Updated entry', request, response);
    };

    this.cache.onCacheEntriesGroupUpdated = (
      groupName: string,
      entries: {
        [key: string]: { request: CachedRequest; response: CachedResponse };
      }
    ) => {
      this.logger.debug('Cache group updated', groupName, entries);
      const data = JSON.parse(groupName);
      this.workflowVersionUpdateSubject.next(data);
    };

    this.cache.onCacheEntryDeleted = (key: string) => {
      this.logger.debug('Cache entry DELETED', key);
    };

    this.cache.onCacheEntriesGroupDeleted = (
      groupName: string,
      entries: Array<string>
    ) => {
      this.logger.debug('Cache group DELETED', groupName, entries);
      const data = JSON.parse(groupName);
      this.workflowVersionDeleteSubject.next(data);
    };

    // notify that the service is ready
    this.initSubject.next(true);
  }

  public readySubscription(): Observable<boolean> {
    return this.initSubject.asObservable();
  }

  public get cache(): CacheManager {
    return this._cache;
  }

  public async clear() {
    return await this.cache.clear();
  }

  private setupNetworkListener() {
    this.isOnline = navigator.onLine;
    window.addEventListener('offline', () => {
      alert('Offline');
      this.isOnline = false;
    });
    window.addEventListener('online', () => {
      alert('OnLine');
      this.isOnline = true;
    });
  }

  public get socketIO(): ApiSocket {
    return this.socket;
  }

  public get jobs$(): Observable<Job> {
    return this.jobSubject.asObservable();
  }

  public onJobUpdate(oayload: object) {
    this.logger.debug('The job', oayload);
    this.jobSubject.next(oayload['data']);
  }

  public onCacheEntryCreated(entry: { request: string; data: object }) {
    this.logger.debug('onCacheEntryCreated', entry);
  }

  public onCacheEntryUpdated(entry: { request: string; data: object }) {
    this.logger.debug('onCacheEntryUpdated', entry);
  }

  public onCacheEntryDeleted(entry: { key: string }) {
    this.logger.debug('onCacheEntryDeleted', entry);
  }

  public onCacheEntriesGroupCreated(group: {
    groupName: string;
    entries: {
      [key: string]: { request: string; data: object };
    };
  }) {
    this.logger.debug('onCacheEntriesGroupCreated', group);
    this.workflowVersionCreatedSubject.next(JSON.parse(group.groupName));
  }

  public onCacheEntriesGroupUpdated(group: {
    groupName: string;
    entries: {
      [key: string]: { request: string; data: object };
    };
  }) {
    this.logger.debug('onCacheEntriesGroupUpdated', group);
    this.logger.debug('Cache group updated', group);
    this.workflowVersionUpdateSubject.next(JSON.parse(group.groupName));
  }

  public onCacheEntriesGroupDeleted(group: {
    groupName: string;
    entries: Array<string>;
  }) {
    this.logger.debug('onCacheEntriesGroupDeleted', group);
    this.workflowVersionDeleteSubject.next(JSON.parse(group.groupName));
  }

  private enableBackgroundRefresh(interval: number = 5 * 60 * 1000) {
    this.worker.postMessage({
      type: 'start',
      payload: { interval: interval },
    });
  }

  public onVisibilityChanged(e) {
    this.logger.debug('visibility', e, document.hidden);
    if (!document.hidden) {
      this.enableBackgroundRefresh();
    } else {
      this.worker.postMessage({ type: 'pause' });
    }
  }

  /**
   * Constructs a `GET` request that interprets the body as an `ArrayBuffer` and returns the
   * response in an `ArrayBuffer`.
   *
   * @param url     The endpoint URL.
   * @param options The HTTP options to send with the request.
   *
   * @return An `Observable` of the response, with the response body as an `ArrayBuffer`.
   */
  public get<T>(
    url: string,
    options: {
      headers?:
        | HttpHeaders
        | {
            [header: string]: string | string[];
          };
      observe?: 'body';
      params?:
        | HttpParams
        | {
            [param: string]: string | string[];
          };
      reportProgress?: boolean;
      // responseType: 'json';
      withCredentials?: boolean;
      cacheEntry?: string;
      cacheGroup?: string;
      cacheTTL?: number;
      cacheNotifyUpdates?: boolean;
    }
  ): Observable<T> {
    // console.debug('HEADERS input', options);
    const headers = {};
    if (options.headers instanceof HttpHeaders) {
      for (let k of options.headers.keys()) {
        // this.logger.debug('HEADERS...', k, options.headers[k]);
        headers[k] = options.headers[k];
      }
    } else {
      for (let k in options.headers) {
        if (typeof options.headers[k] === 'string') {
          headers[k] = options.headers[k] as string;
        } else {
          headers[k] = (options.headers[k] as string[]).join(',');
        }
      }
    }

    const input = new URL(url);
    if (options.params) {
      if (options.params instanceof HttpParams) {
        for (let k of options.params.keys()) {
          if (typeof options.params[k] === 'string') {
            input.searchParams.append(k, options.params[k] as string);
          } else {
            input.searchParams.append(
              k,
              (options.params[k] as string[]).join(',')
            );
          }
        }
      } else {
        for (let k in options.params) {
          input.searchParams.append(k, options.params[k] as string);
        }
      }
    }

    let init: CachedRequestInit = {
      ...options,
      headers: headers,
    };
    this.logger.debug('Cache request headers', init);
    return from(
      this.cache
        .fetch(input.toString(), init, false)
        .then(async (r) => {
          const v = await r.json();
          return v as T;
        })
        .catch((e) => {
          this.logger.error('Cache error', e);
          throw e;
        })
    );
  }

  public post<T>(
    url: string,
    body: any | null,
    options: {
      headers?:
        | HttpHeaders
        | {
            [header: string]: string | string[];
          };
      observe?: 'body';
      params?:
        | HttpParams
        | {
            [param: string]: string | string[];
          };
      reportProgress?: boolean;
      responseType: 'json';
      withCredentials?: boolean;
    }
  ): Observable<T> {
    return this.http.post<T>(url, body, options);
  }

  public delete<T>(
    url: string,
    options: {
      headers?:
        | HttpHeaders
        | {
            [header: string]: string | string[];
          };
      observe?: 'body';
      params?:
        | HttpParams
        | {
            [param: string]: string | string[];
          };
      reportProgress?: boolean;
      responseType: 'json';
      withCredentials?: boolean;
    }
  ): Observable<T> {
    return this.http.delete<T>(url, options);
  }

  public startSync() {
    if (!this._skipInitialSync) {
      this.cache.isEmpty().then((empty) => {
        if (!empty) return this.socketIO?.sync();
      });
    } else {
      this.logger.debug('Initial sync not required');
    }
  }

  public get refreshProgressStatus$(): Observable<CacheRefreshStatus> {
    return this.cache.refreshProgressStatus$;
  }

  public async refresh(): Promise<{ [req: string]: Response }> {
    return await this.cache.refresh();
  }

  public async deleteCacheEntryByURL(url: string): Promise<boolean> {
    return await this.cache.deleteCacheEntryByURL(url);
  }

  public async deleteCacheEntriesByURLs(urls: string[]): Promise<boolean[]> {
    const result: Array<boolean> = [];
    for (let url of urls) {
      result[url] = await this.cache.deleteCacheEntryByURL(url);
    }
    return result;
  }

  public async deleteCacheEntryByKey(key: string): Promise<boolean> {
    return await this.cache.deleteCacheEntryByKey(key);
  }

  public async deleteCacheEntriesByKeys(keys: string[]): Promise<boolean[]> {
    return await this.cache.deleteCacheEntriesByKeys(keys);
  }

  public async refreshCacheEntriesByKeys(keys: string[]): Promise<boolean[]> {
    const result: Array<boolean> = [];
    for (let k of keys) {
      result[k] = await this.cache.refreshEntryByKey(k, { ignoreTTL: true });
    }
    return result;
  }

  public async deleteCacheEntriesGroup(
    group: string | object,
    notifyEntryDeletion: boolean = true
  ): Promise<boolean> {
    const groupKey: string =
      typeof group === 'string' ? group : JSON.stringify(group);
    return await this.cache.deleteCacheEntriesGroup(
      groupKey,
      notifyEntryDeletion
    );
  }

  public async refreshCacheEntriesGroup(
    group: string | object,
    notifyEntryGroupUpdate: boolean = true
  ) {
    const groupKey: string =
      typeof group === 'string' ? group : JSON.stringify(group);
    this.logger.error('The Group Key', groupKey, group);
    return await this.cache.refreshCacheEntriesGroup(
      groupKey,
      notifyEntryGroupUpdate
    );
  }

  private titleCaseWord(word: string) {
    if (!word) return word;
    return word[0].toUpperCase() + word.substr(1);
  }

  private setUpWorkerMessageHandler(worker: Worker) {
    if (!worker) return;

    worker.onmessage = (event) => {
      this.logger.debug('received message from worker', event.data);
      const message: {
        type: string;
        data: object;
      } = event.data;
      try {
        if (!event.data || !event.data['type']) {
          this.logger.warn(
            "Invalid worker message: unable to find the 'type' property"
          );
          return;
        }
        if (message.type === 'echo' || message.type === 'pong') {
          this.logger.debug(
            `Received an "${message.type}" message from worker`,
            message.data
          );
        } else {
          this.logger.debug('received message from worker', event.data['type']);
          const fnName =
            'on' +
            event.data['type'][0].toUpperCase() +
            event.data['type'].slice(1);
          this.logger.debug('Function name:', fnName);
          if (this[fnName]) {
            this[fnName](event.data['payload']);
          } else {
            this.logger.warn(`${fnName} is not a function`);
          }
        }
      } catch (e) {
        this.logger.error(e);
      }
    };
  }
}
