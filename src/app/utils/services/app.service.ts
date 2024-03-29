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

import { Injectable } from '@angular/core';
import { ToastrService } from 'ngx-toastr';

import { BehaviorSubject, Observable, Subject, Subscription, of } from 'rxjs';
import {
  catchError,
  finalize,
  map,
  mergeMap,
  tap,
  toArray,
} from 'rxjs/operators';
import { Job } from 'src/app/models/job.model';
import { UserNotification } from 'src/app/models/notification.model';
import { Registry, RegistryWorkflow } from 'src/app/models/registry.models';
import { AggregatedStatusStats } from 'src/app/models/stats.model';
import { Suite } from 'src/app/models/suite.models';
import { TestBuild } from 'src/app/models/testBuild.models';
import { TestInstance } from 'src/app/models/testInstance.models';
import { User } from 'src/app/models/user.modes';
import {
  Workflow,
  WorkflowVersion,
  WorkflowVersionDescriptor,
  WorkflowsLoadingStatus,
} from 'src/app/models/workflow.model';
import { AuthService } from 'src/app/utils/services/auth.service';
import { Logger, LoggerManager } from '../logging';
import { ApiService } from './api.service';
import { AppConfigService } from './config.service';

@Injectable({
  providedIn: 'root',
})
export class AppService {
  // internal state
  private _notifications: UserNotification[];
  private _registry: Registry;
  private _registries: Registry[];
  private _registryWorkflow: RegistryWorkflow;
  private _registryWorkflows: { [uuid: string]: RegistryWorkflow[] } = {};
  private _workflows: Workflow[];
  private _workflow_versions: WorkflowVersion[];
  private _workflow_stats: AggregatedStatusStats;
  private _workflow: WorkflowVersion;
  private _suite: Suite;
  private _testInstance: TestInstance;
  private _testBuild: TestBuild;
  private _currentUser: User;

  private loadingWorkflows = false;
  private loadingWorkflowMap: { [uuid: string]: boolean } = {};

  // initialize data sources
  private subjectUser: Subject<User> = new BehaviorSubject<User>(undefined);
  private subjectReady: Subject<boolean> = new BehaviorSubject<boolean>(false);
  private subjectNotifications = new Subject<UserNotification[]>();
  private subjectRegistry = new Subject<Registry>();
  private subjectRegistries = new Subject<Registry[]>();
  private subjectRegistryWorkflow = new Subject<RegistryWorkflow>();
  private subjectRegistryWorkflows = new Subject<RegistryWorkflow[]>();
  private subjectWorkflows = new Subject<Workflow[]>();
  private subjectWorkflow = new Subject<WorkflowVersion>();
  private subjectTestSuite = new Subject<Suite>();
  private subjectTestInstance = new Subject<TestInstance>();
  private subjectTestBuild = new Subject<TestBuild>();
  private subjectLoadingWorkflow = new Subject<{
    uuid: string;
    loading: boolean;
  }>();
  private subjectLoadingWorkflows = new BehaviorSubject<boolean>(false);
  private subjectWorkflowUpdate = new Subject<WorkflowVersion>();
  private subjectLoadingWorkflowsStatus = new BehaviorSubject<WorkflowsLoadingStatus>(
    null
  );

  // initialize data observables
  // private _observableUser = this.subjectUser.asObservable();
  private _observableNotifications = this.subjectNotifications.asObservable();
  private _observableRegistry = this.subjectRegistry.asObservable();
  private _observableRegistries = this.subjectRegistries.asObservable();
  private _observableRegistryWorkflow = this.subjectRegistryWorkflow.asObservable();
  private _observableRegistryWorkflows = this.subjectRegistryWorkflows.asObservable();
  private _observableWorkflows = this.subjectWorkflows.asObservable();
  private _observableWorkflow = this.subjectWorkflow.asObservable();
  private _observableTestSuite = this.subjectTestSuite.asObservable();
  private _observableTestInstance = this.subjectTestInstance.asObservable();
  private _observableTestBuild = this.subjectTestBuild.asObservable();
  private _observableLoadingWorkflow = this.subjectLoadingWorkflow.asObservable();
  private _observableLoadingWorkflows = this.subjectLoadingWorkflows.asObservable();
  private _observableWorkflowUpdate = this.subjectWorkflowUpdate.asObservable();
  // Initialize logger
  private logger: Logger = LoggerManager.create('AppService');

  //
  private syncTimeout = null;

  // subscriptions
  private subscriptions: Subscription[] = [];

  // session keys
  private WORKFLOW_UUID = 'workflow_uuid';
  private SUITE_UUID = 'suite_uuid';
  private TEST_INSTANCE_UUID = 'test_instance_uuid';
  private TEST_BUILD_ID = 'test_build_id';

  constructor(
    private config: AppConfigService,
    private auth: AuthService,
    private api: ApiService,
    private toastService: ToastrService
  ) {
    this.logger.debug('AppService created!');

    this.subscriptions.push(
      this.api.notifyWhenReady().subscribe((ready) => {
        if (ready) {
          this.init();
        }
      })
    );
  }

  public notifyWhenReady(): Observable<boolean> {
    return this.subjectReady.asObservable();
  }

  public init() {
    this.setupNetworkListener();

    // subscribe for the current selected workflow
    this.subscriptions.push(
      this._observableWorkflow.subscribe((w: WorkflowVersion) => {
        this._workflow = w;
      })
    );

    // subscribe to the current user
    this.subscriptions.push(
      this.auth.userLogged$().subscribe((logged) => {
        // skip updates when user is undefined
        if (logged === undefined) {
          this.logger.debug('User logged: undefined');
          return;
        }
        // update user data when user is logged
        if (logged === true) {
          this.api.get_current_user().subscribe((data) => {
            this.logger.debug('Current user from APP', data);
            // alert('Settings data: ' + data);
            this._currentUser = data;
            this.subjectUser.next(data);
            // join socket.io room
            if (data) this.api.socketIO.join(data);
          });
        } else {
          if (this._currentUser !== null)
            this.api.socketIO?.leave(this._currentUser);
          this._currentUser = null;
          this.subjectUser.next(null);
        }
      })
    );

    this.api.onWorkflowVersionCreated.subscribe((wf) => {
      this.logger.debug('New workflow created', wf);
      if (
        this.workflow_versions &&
        this.workflow_versions.find(
          (v) =>
            v.uuid === wf.uuid &&
            (v.version['version'] === wf.version ||
              (v.version['is_latest'] && wf.version === 'latest'))
        )
      ) {
        this.logger.warn('Workflow version already loaded');
        return;
      }
      this.api.get_workflow(wf.uuid).subscribe((workflow) => {
        this.api
          .get_workflow_version(wf.uuid, wf.version, {
            previous_versions: true,
            ro_crate: true,
            load_status: true,
            load_suites: true,
          })
          .subscribe((workflow_version: WorkflowVersion) => {
            let current_workflow = this.workflows.find(
              (w) => w.uuid === wf.uuid
            );
            if (!current_workflow) {
              current_workflow = workflow;
              this.logger.debug(
                `Adding workflow ${workflow.uuid} to the list of workflows`
              );
              this.workflows.push(workflow);
            } else {
              this.logger.debug('The workflow already exists');
            }
            if (
              !this.workflow_versions.find(
                (v) =>
                  v.uuid === wf.uuid &&
                  (v.version['version'] === wf.version ||
                    (v.version['is_latest'] && wf.version === 'latest'))
              )
            ) {
              current_workflow.addVersion(workflow_version, true);
              current_workflow.currentVersion = workflow_version;
              this.workflow_versions.push(workflow_version);
              this.subjectWorkflows.next(this.workflows);
              this.logger.warn('Current list of workflows', this.workflows);
              this.logger.warn(
                'Current list of workflow versions',
                this.workflow_versions
              );
              this.logger.debug(
                'Workflow version loaded',
                wf,
                workflow_version.version,
                wf.version
              );
              this.toastService.clear();
              this.toastService.success(
                `${workflow_version.name} (ver.${workflow_version.version['version']}) loaded!`,
                'Workflow added',
                { closeButton: true, timeOut: 2000 }
              );
            }
          });
      });
    });

    this.api.onWorkflowVersionUpdate.subscribe(
      (workflowVersion: { uuid: string; version: string }) => {
        this.logger.debug('Updating workflow: ', workflowVersion);
        this.logger.debug('Current list of workflows', this.workflows);
        const workflow: Workflow =
          this.workflows?.find((w) => w.uuid === workflowVersion.uuid) ||
          new Workflow({ uuid: workflowVersion.uuid });
        if (!this.workflow_versions) this._workflow_versions = [];
        const cwv_index = this.workflow_versions?.findIndex(
          (v) =>
            v.uuid === workflowVersion.uuid &&
            v.version['version'] === workflowVersion.version
        );
        const cwv: WorkflowVersion = cwv_index
          ? this.workflow_versions[cwv_index]
          : null;
        this.logger.debug('Found workflow:', workflow, cwv);
        if (!workflow) {
          this.logger.warn('Workflow not found');
          return;
        }

        const oldTimestamp = cwv?.modified ?? 0;
        this.logger.debug('Old timestamp', oldTimestamp, cwv);

        this.api
          .get_workflow(workflowVersion.uuid)
          .subscribe((updatedWorkflow) => {
            const isCurrentVersion =
              workflow.currentVersion &&
              workflow.currentVersion.version['version'] ===
                workflowVersion.version;
            this.logger.warn('Workflow updated', workflow, updatedWorkflow);
            workflow.name = updatedWorkflow.name;
            workflow['public'] = updatedWorkflow['public'];
            this.logger.warn(
              'Workflow updated after',
              workflow,
              updatedWorkflow
            );
            this.loadWorkflowVersion(
              workflow,
              workflowVersion.version,
              true,
              true
            )
              .pipe(
                map((wv: WorkflowVersion) => {
                  this.logger.debug('The workflow', wv);
                  let updated_workflow_version = workflow.getVersion(
                    workflowVersion.version
                  );
                  this.logger.debug(
                    'New timestamp',
                    updated_workflow_version,
                    updated_workflow_version.modified,
                    wv,
                    wv.modified
                  );
                  const outdated = wv.modified > oldTimestamp;
                  workflow.addVersion(wv, isCurrentVersion);
                  wv.name = workflow.name;
                  if (cwv_index >= 0) this.workflow_versions[cwv_index] = wv;
                  else this.workflow_versions.push(wv);
                  // return the new workflow version only if more recent
                  // than the previous one
                  return outdated
                    ? workflow.getVersion(workflowVersion.version)
                    : null;
                })
              )
              .subscribe((wv: WorkflowVersion) => {
                this.setLoadingWorkflows(false);
                if (!wv) {
                  this.logger.warn('Workflow version not outdated');
                } else {
                  this.subjectWorkflowUpdate.next(wv);
                  this.updateLoadingStateOfWorkflow(wv.uuid, false);
                  this.toastService.success(
                    `${wv.name} (ver.${wv.version['version']}) reloaded!`,
                    'Workflow updated',
                    {
                      closeButton: true,
                      timeOut: 2000,
                    }
                  );
                }
              });
          });
      }
    );

    this.api.onWorkflowVersionDeleted.subscribe((wf) => {
      this.logger.debug(
        'on workflow version deleted ',
        wf,
        this.workflow_versions
      );
      const workflow = this.workflows.find((w) => w.uuid === wf.uuid);
      if (!workflow) {
        this.logger.warn('Nothing to delete: workflow deleted yet', wf);
        return;
      }
      this.logger.debug('Found workflow: ', workflow);
      if (workflow.versionDescriptors.length === 1) {
        this.workflows.splice(this.workflows.indexOf(workflow), 1);
        this.workflow_versions.splice(
          this.workflow_versions.findIndex((v) => v.uuid === wf.uuid)
        );
        this.logger.debug('Check workflows after deletion', this.workflows);
        this.subjectWorkflows.next(this.workflows);
        this.toastService.error(``, `Workflow ${workflow.name} deleted`, {
          timeOut: 3000,
        });
      } else {
        // Update array of version descriptors
        const nextVersion = workflow.pickVersion([wf.version]);
        if (!nextVersion) {
          this.logger.warn('Something wrong... next version not found');
          return;
        }
        this.loadWorkflowVersion(
          workflow,
          nextVersion.name,
          true,
          true,
          false
        ).subscribe((nextWorkflowVersion) => {
          workflow.addVersion(nextWorkflowVersion, true, true);
          workflow.removeVersion(wf.version);
          // workflow.versionDescriptors[0].isLatest = true;

          this.workflow_versions.push(nextWorkflowVersion);
          this.workflow_versions.splice(
            this.workflow_versions.findIndex(
              (v) => v.uuid === wf.uuid && v.version['version'] === wf.version
            ),
            1
          );

          this.logger.debug('Check workflows after deletion', this.workflows);
          this.subjectWorkflows.next(this.workflows);
          this.toastService.error(
            ``,
            `Workflow ${workflow.name} (ver.${wf.version}) deleted`,
            {
              closeButton: true,
              timeOut: 2000,
            }
          );
        });
      }
    });

    // get user data if already logged
    // this.config.onLoad.subscribe((loaded) => {
    //   if (loaded) {
    //     this.checkIsUserLogged().then((logged) => {
    //       if (logged) {
    //         this.api.get_current_user().subscribe((data) => {
    //           this.logger.debug('Current user from APP', data);
    //           this._currentUser = data;
    //           if (data) this.api.socketIO.join(data);
    //         });
    //       }
    //     });
    //   }
    // });

    // notify that the app is ready
    this.subjectReady.next(true);
  }

  private setupNetworkListener() {
    window.addEventListener('offline', () => {
      this.logger.warn('Offline mode enabled');
    });
    window.addEventListener('online', () => {
      this.logger.warn('OnLine mode enabled');
      this.api.socketIO.connect();
      if (!this.isUserLogged()) this.logger.debug('No user logged');
      else {
        this.api.get_current_user().subscribe((user) => {
          if (user) this.api.socketIO.join(user);
        });
      }
    });
  }

  public get job$(): Observable<Job> {
    return this.api.jobs$;
  }

  public loadUserProfile(): Observable<User> {
    const user = this.auth.getCurrentUser();
    this._currentUser = user;
    return of(user);
  }

  public isUserLogged(): boolean {
    return this.auth.isUserLogged();
  }

  public get observableUser(): Observable<User> {
    return this.subjectUser.asObservable();
  }

  public async checkIsUserLogged(): Promise<boolean> {
    return await this.auth.checkIsUserLogged();
  }

  public isLoadingWorkflow(uuid: string): boolean {
    return this.loadingWorkflowMap[uuid] ?? false;
  }

  public setLoadingWorkflows(value: boolean) {
    this.loadingWorkflows = value;
    this.subjectLoadingWorkflows.next(value);
  }

  public isLoadingWorkflows(): boolean {
    return this.loadingWorkflows;
  }

  public get isLoadingWorkflowsAsObservable(): Observable<boolean> {
    return this._observableLoadingWorkflows;
  }

  public login(): Promise<boolean> {
    return this.auth.login();
  }

  public async authorize() {
    return await this.auth.authorize();
  }

  public async clearAll(): Promise<boolean> {
    await this.api.cache.clear().then(async () => {});
    this.reset();
    return true;
  }

  public async clearListOfWorkflows(): Promise<boolean> {
    await this.api.cache.deleteCacheEntriesByKeys([
      'userProfile',
      'userSubscriptions',
      'subscribedWorkflows',
      'userScopedWorkflows',
      'userNotifications',
      'registeredWorkflows',
    ]);
    this.reset();
    return true;
  }

  public async refreshWorkflowVersion(
    workflow: {
      uuid: string;
      version: string;
    },
    notifyUpdate?: boolean
  ): Promise<boolean> {
    this.updateLoadingStateOfWorkflow(workflow.uuid, true);
    await this.api.cache.refreshCacheEntriesGroup(
      JSON.stringify({
        type: 'workflow',
        uuid: workflow.uuid,
      }),
      false
    );
    await this.api.cache.refreshCacheEntriesGroup(
      JSON.stringify({
        type: 'workflow',
        uuid: workflow.uuid,
        version: workflow.version,
      }),
      notifyUpdate ?? true
    );
    this.updateLoadingStateOfWorkflow(workflow.uuid, false);
    return true;
  }

  public async refreshWorkflowsList(workflows?: Array<WorkflowVersion>) {
    if (!workflows) {
      workflows = await this.getListOfWorkflows(
        false,
        this.isUserLogged(),
        this.isUserLogged()
      ).toPromise();
      this.logger.debug('List of workflows loaded', workflows);
    }
    this.logger.debug('List of workflows to be refreshed', workflows);
    workflows.forEach(async (wf) => {
      await this.refreshWorkflowVersion({
        uuid: wf.uuid,
        version: wf.version['version'],
      });
    });
  }

  public startSync() {
    this.api.startSync();
  }

  private reset(): void {
    this._workflow = null;
    this._workflow_stats = null;
    this._workflows = null;
    this._workflow_versions = null;
  }

  public async logout() {
    return this.api.logout().then(() => {
      this.reset();
    });
  }

  public get currentUser(): User {
    return this._currentUser;
  }

  public get registry(): Registry {
    return this._registry;
  }

  public get registries(): Registry[] {
    return this._registries;
  }

  public get registryWorkflow(): RegistryWorkflow {
    return this._registryWorkflow;
  }

  public get registryWorkflows(): RegistryWorkflow[] {
    return this.getRegistryWorkflows();
  }

  public getRegistryWorkflows(uuid: string = null): RegistryWorkflow[] {
    let registry_uuid = uuid
      ? uuid
      : this._registry
      ? this._registry.uuid
      : null;
    if (!registry_uuid) return null;
    return this._registryWorkflows[registry_uuid];
  }

  public get workflows(): Workflow[] {
    return this._workflows;
  }

  public get workflow_versions(): WorkflowVersion[] {
    return this._workflow_versions;
  }

  public findWorkflow(uuid: string): Workflow {
    return this._workflows
      ? this._workflows.find((w) => w.uuid === uuid)
      : null;
  }

  public findWorkflowVersion(uuid: string, version: string): WorkflowVersion {
    return this._workflow_versions
      ? this._workflow_versions.find(
          (w) => w.uuid === uuid && w.version['version'] === version
        )
      : null;
  }

  public get workflow(): WorkflowVersion {
    return this._workflow;
  }

  public get testSuite(): Suite {
    return this._suite;
  }

  public get notifications(): UserNotification[] {
    return this._notifications;
  }

  public findTestSuite(suite_uuid: string, wf_uuid: string = null): Suite {
    if (!this._workflow && !wf_uuid) return null;
    let workflow: WorkflowVersion = this._workflow;
    if (wf_uuid && this._workflow_versions) {
      workflow = this._workflow_versions.find((w) => w.uuid === wf_uuid);
    }
    if (!workflow) return null;
    return workflow.suites
      ? (workflow.suites.all.find((s) => s.uuid === suite_uuid) as Suite)
      : null;
  }

  public get testInstance(): TestInstance {
    return this._testInstance;
  }

  public get testBuilds(): TestBuild {
    return this._testBuild;
  }

  public get observableWorkflowUpdate(): Observable<WorkflowVersion> {
    return this._observableWorkflowUpdate;
  }

  public get observableLoadingWorkflow(): Observable<{
    uuid: string;
    loading: boolean;
  }> {
    return this._observableLoadingWorkflow;
  }

  // public get observableUserLogged(): Observable<boolean> {
  //   // return this.auth.userLoggedAsObservable();
  //   return this.subjectUser.asObservable
  // }

  public get observableRegistry(): Observable<Registry> {
    return this._observableRegistry;
  }

  public get observableRegistries(): Observable<Registry[]> {
    return this._observableRegistries;
  }

  public get observableRegistryWorkflow(): Observable<RegistryWorkflow> {
    return this._observableRegistryWorkflow;
  }

  public get observableRegistryWorkflows(): Observable<RegistryWorkflow[]> {
    return this._observableRegistryWorkflows;
  }

  public get observableWorkflows(): Observable<Workflow[]> {
    return this._observableWorkflows;
  }

  public get observableWorkflow(): Observable<WorkflowVersion> {
    return this._observableWorkflow;
  }

  public get observableTestSuite(): Observable<Suite> {
    return this._observableTestSuite;
  }

  public get observableTestInstance(): Observable<TestInstance> {
    return this._observableTestInstance;
  }

  public get observableTestBuild(): Observable<TestBuild> {
    return this._observableTestBuild;
  }

  public get observableNotifications(): Observable<UserNotification[]> {
    return this._observableNotifications;
  }

  public decodeUrl(url: string) {
    let data = JSON.parse(atob(url));
    return data;
  }

  public subscribeWorkflow(w: WorkflowVersion): Observable<WorkflowVersion> {
    return this.api.subscribeWorkflow(w).pipe(
      tap((wd: WorkflowVersion) => {
        this.logger.debug('Added subscription to workflow: ', wd);
      })
    );
  }

  public unsubscribeWorkflow(w: WorkflowVersion): Observable<WorkflowVersion> {
    return this.api.unsubscribeWorkflow(w).pipe(
      tap((wd: WorkflowVersion) => {
        this.logger.debug('Removed subscription to workflow: ', wd);
      })
    );
  }

  public loadRegistries(): Observable<Registry[]> {
    return this.api.getRegistries().pipe(
      map((data: Registry[]) => {
        this._registries = data;
        this.subjectRegistries.next(this._registries);
        return this._registries;
      })
    );
  }

  private findRegistryByUuid(uuid: string): Registry {
    if (!this._registries) return null;
    return this._registries.find((e) => e.uuid === uuid);
  }

  public selectRegistry(uuid: string, useCache: boolean = true) {
    this.logger.debug('Selecting registry ', uuid);
    this._registry = this.findRegistryByUuid(uuid);
    this.subjectRegistry.next(this._registry);
    if (this._registry) {
      if (uuid in this._registryWorkflows && useCache) {
        this.logger.debug('Using cached workflows');
        this.subjectRegistryWorkflows.next(this._registryWorkflows[uuid]);
      } else {
        this.api
          .getRegistryWorkflows(uuid)
          .subscribe((data: RegistryWorkflow[]) => {
            this.logger.debug('Loaded registry workflows...', data);
            let sorted = data.sort((a, b) => {
              return a.identifier.localeCompare(b.identifier, undefined, {
                numeric: true,
                sensitivity: 'base',
              });
            });
            this._registryWorkflows[uuid] = sorted;
            this.subjectRegistryWorkflows.next(sorted);
          });
      }
    }
  }

  public selectRegistryWorkflow(workflow_identifier: string) {
    // TODO: enable caching
    this.api
      .getRegistryWorkflow(this.registry.uuid, workflow_identifier)
      .subscribe((w: RegistryWorkflow) => {
        this.logger.debug('Loaded registry workflow data', w);
        this._registryWorkflow = w;
        this.subjectRegistryWorkflow.next(w);
      });
  }

  public get observableLoadingWorkflowsStatus() {
    return this.subjectLoadingWorkflowsStatus.asObservable();
  }

  getListOfWorkflows(
    useCache = false,
    filteredByUser: boolean = undefined,
    includeSubScriptions: boolean = undefined
  ): Observable<any> {
    // Process workflow items
    return this.api
      .get_workflows(
        filteredByUser ?? this.isUserLogged(),
        includeSubScriptions ?? this.isUserLogged(),
        false,
        true,
        useCache
      )
      .pipe(
        map((data) => {
          const wfs = data['items'] as Array<any>;
          this.logger.warn('Loading workflows', wfs);
          return wfs;
        })
      );
  }

  loadWorkflows(
    useCache = false,
    filteredByUser: boolean = undefined,
    includeSubScriptions: boolean = undefined
  ): Observable<any> {
    // if (this.loadingWorkflows) return of(this);
    // if (useCache && this._workflowsStats) {
    //   this.logger.debug('Using cache', this._workflowsStats);
    //   this.subjectWorkflows.next(this._workflowsStats);
    //   return;
    // }

    // Process workflow items
    let stats = new AggregatedStatusStats();
    let workflows: Workflow[] = [];
    let workflow_versions: WorkflowVersion[] = [];

    let workflowsStatus: WorkflowsLoadingStatus = null;
    this.subjectLoadingWorkflowsStatus.next(null);

    this.setLoadingWorkflows(true);
    return this.api
      .get_workflows(
        filteredByUser ?? this.isUserLogged(),
        includeSubScriptions ?? this.isUserLogged(),
        false,
        true,
        useCache
      )
      .pipe(
        map((data) => {
          const wfs = data['items'] as Array<any>;
          workflowsStatus = new WorkflowsLoadingStatus(wfs);
          return wfs;
        }),
        mergeMap((w) => w),
        map((wdata) => {
          // const queries: Array<
          //   Observable<{ workflow: Workflow; version: WorkflowVersion }>
          // > = [];

          let workflow: Workflow = null;
          // let workflow_version: WorkflowVersion = null;
          // Load the latest workflow version from the back-end
          // if cache is disabled or it has not been found

          // this.setLoadingWorkflows(true);
          let versions_data = wdata['versions'];
          workflow = workflows.find((e) => e['uuid'] === wdata['uuid']);
          if (!workflow) {
            workflow = new Workflow(wdata);
            workflows.push(workflow);
          }
          let vdata = versions_data
            ? versions_data.find((v: { [x: string]: any }) => v['is_latest'])
            : null;
          this.logger.debug('VDATA', vdata);
          return this.loadWorkflowVersion(
            workflow,
            wdata['latest_version'],
            true,
            useCache
          ).pipe(
            map((workflow_version: WorkflowVersion) => {
              if (filteredByUser && includeSubScriptions)
                workflow_version.subscriptions = workflow.getRawData()[
                  'subscriptions'
                ];
              workflow.addVersion(workflow_version, true);
              workflow_versions.push(workflow_version);
              stats.add(workflow_version);
              this.logger.debug(
                'Data loaded for workflow',
                workflow,
                workflow_version.uuid,
                workflow_versions,
                stats
              );
              workflowsStatus.setLoaded(workflow.uuid);
              this.subjectLoadingWorkflowsStatus.next(workflowsStatus);
              return {
                workflow: workflow,
                workflow_version: workflow_version,
              };
            }),
            catchError((e) => {
              workflowsStatus.setLoaded(workflow.uuid);
              this.logger.error('Error loading workflow', e);
              this.subjectLoadingWorkflowsStatus.next(workflowsStatus);
              return of(null);
            })
          );
        }),
        mergeMap((x) => x),
        toArray(),
        map((result) => {
          this.logger.debug('Loaded workflows', result);
          // alert('Workflows reloaded');
          // const syncRequired: boolean = !this._workflows;
          // if (syncRequired) {
          //   if (this.syncTimeout) clearTimeout(this.syncTimeout);
          //   this.syncTimeout = setTimeout(() => {
          //     this.api.startSync();
          //   }, 10000);
          // }
          this._workflows = workflows;
          this._workflow_versions = workflow_versions;
          this.subjectWorkflows.next(this._workflows);
          this.setLoadingWorkflows(false);
          return stats;
        })
      );
  }

  private updateLoadingStateOfWorkflow(uuid: string, loading: boolean) {
    this.loadingWorkflowMap[uuid] = loading;
    this.subjectLoadingWorkflow.next({ uuid: uuid, loading: loading });
  }

  loadWorkflowVersion(
    w: Workflow,
    version: string = 'latest',
    status: boolean = false,
    useCache: boolean = true,
    notifyUpdate: boolean = true
  ): Observable<WorkflowVersion> {
    if (notifyUpdate) this.updateLoadingStateOfWorkflow(w.uuid, true);
    return this.api
      .get_workflow_version(w.uuid, version, {
        previous_versions: true,
        ro_crate: true,
        load_status: status,
        load_suites: true,
        use_cache: useCache,
      })
      .pipe(
        map((workflow_version: WorkflowVersion) => {
          this.logger.debug('Loaded workflow version data:', workflow_version);
          w.addVersion(workflow_version);
          if (
            w.currentVersion &&
            w.currentVersion.version['version'] === version
          )
            w.currentVersion = workflow_version;
          // w.update(workflow_version);
          // w.suites = wdata.suites;
          workflow_version.subscriptions = w.getRawData()['subscriptions'];
          // this.updateLoadingStateOfWorkflow(w.uuid, false);
          if (notifyUpdate) this.updateLoadingStateOfWorkflow(w.uuid, false);
          this.logger.debug('Workflow data updated!');
          return workflow_version;
        }),
        finalize(() => {
          setTimeout(() => {
            // this.updateLoadingStateOfWorkflow(w.uuid, false);
          }, 500);
        })
      );
  }

  public selectWorkflowVersion(uuid: string, version: string = 'latest') {
    let w: WorkflowVersion;
    this.logger.debug(
      'Selecting workflow',
      uuid,
      version,
      this._workflow_versions
    );
    if (
      this._workflow &&
      this._workflow.uuid === uuid &&
      this._workflow.version['version'] === version
    ) {
      this._selectWorkflowVersion(this._workflow);
    } else if (!this._workflow_versions) {
      this.api
        .get_workflow_version(uuid, version, {
          previous_versions: true,
          ro_crate: true,
          load_status: true,
          load_suites: true,
        })
        .subscribe(
          (w: WorkflowVersion) => {
            this._selectWorkflowVersion(w);
          },
          (error) => {
            this.logger.error('Error', error);
            if (error.status === 404) {
              this.selectWorkflowVersion(uuid, 'latest');
            }
          }
        );
    } else {
      w = this._workflow_versions.find(
        (w: WorkflowVersion) =>
          w.uuid === uuid && w.version['version'] === version
      );
      if (!w || !w.suites) {
        this.api
          .get_workflow_version(uuid, version, {
            previous_versions: true,
            ro_crate: true,
            load_status: true,
            load_suites: true,
          })
          .subscribe((w: WorkflowVersion) => {
            this._selectWorkflowVersion(w);
          });
      } else {
        this._selectWorkflowVersion(w);
      }
    }
  }

  public registerWorkflowRoCrate(
    uuid: string,
    version: string,
    url: string = null,
    rocrate: string = null,
    name: string = null,
    is_public: boolean = false,
    authorization: string = null
  ): Observable<any> {
    return this.api
      .registerWorkflowRoCrate(
        uuid,
        version,
        url,
        rocrate,
        name,
        is_public,
        authorization
      )
      .pipe(
        map((data) => {
          return data;
          // return this.api
          //   .get_workflow_version(data['uuid'], version, {
          //     previous_versions: false,
          //     ro_crate: true,
          //     load_status: true,
          //     load_suites: true,
          //   })
          //   .pipe(
          //     map((workflow_version: WorkflowVersion) => {
          //       this.logger.debug(
          //         'Registered Workflow RO-Crate:',
          //         workflow_version
          //       );
          //       this.setLoadingWorkflows(false);
          //       return workflow_version;
          //       // this._workflow_versions.push(workflow_version);
          //       // this.logger.debug('Workflow data loaded!');
          //       // let workflow: Workflow = this.findWorkflow(uuid);
          //       // if (!workflow) {
          //       //   this.api
          //       //     .get_workflow(uuid)
          //       //     .subscribe((workflow: Workflow) => {
          //       //       workflow.addVersion(workflow_version, true);
          //       //       this._workflows.push(workflow);
          //       //       this.subjectWorkflows.next(this._workflows);
          //       //       this.setLoadingWorkflows(false);
          //       //     });
          //       // } else {
          //       //   workflow.addVersion(workflow_version, true);
          //       //   this.subjectWorkflows.next(this._workflows);
          //       //   this.setLoadingWorkflows(false);
          //       // }
          //       // return workflow_version;
          //     })
          //   );
        })
      );
  }

  public registerRegistryWorkflow(
    workflow: RegistryWorkflow,
    version: string,
    name: string = null,
    is_public: boolean = false
  ): Observable<object> {
    // this.setLoadingWorkflows(true);
    return this.api
      .registerRegistryWorkflow(
        workflow,
        version,
        name && name.length > 0 ? name : workflow.name,
        is_public
      )
      .pipe(
        map((data) => {
          this.logger.debug('Data of registered workflow', data);
          return data;
          // this.api
          //   .get_workflow_version(data['uuid'], version, {
          //     previous_versions: false,
          //     ro_crate: true,
          //     load_status: true,
          //     load_suites: true,
          //   })
          //   .subscribe((workflow_version: WorkflowVersion) => {
          //     this.logger.debug(
          //       'Registered Workflow RO-Crate:',
          //       workflow_version
          //     );
          //     this._workflow_versions.push(workflow_version);
          //     this.logger.debug('Workflow data loaded!');
          //     let workflow: Workflow = this.findWorkflow(workflow_version.uuid);
          //     if (!workflow) {
          //       this.api
          //         .get_workflow(workflow_version.uuid)
          //         .subscribe((workflow: Workflow) => {
          //           workflow.addVersion(workflow_version, true);
          //           this._workflows.push(workflow);
          //           this.subjectWorkflows.next(this._workflows);
          //           this.setLoadingWorkflows(false);
          //         });
          //     } else {
          //       workflow.addVersion(workflow_version, true);
          //       this.subjectWorkflows.next(this._workflows);
          //       this.setLoadingWorkflows(false);
          //     }
          //   });
          // return data;
        }),
        catchError((err) => {
          this.logger.debug('Error when registering workflow', err);
          this.setLoadingWorkflows(false);
          throw err;
        }),
        finalize(() => {
          // this.setLoadingWorkflows(false);
        })
      );
  }

  public deleteWorkflowVersion(
    workflow_version: WorkflowVersion
  ): Observable<{ uuid: string; version: string }> {
    if (!workflow_version) return;
    let workflow: Workflow = workflow_version.workflow;
    return this.api
      .deleteWorkflowVersion(
        workflow_version.uuid,
        workflow_version.version['version']
      )
      .pipe(
        map((wd: { uuid: string; version: string }) => {
          const versionIndex = workflow.findIndex(workflow_version);
          this.logger.debug('Version index: ', versionIndex);
          if (versionIndex > -1) {
            this._workflow_versions.splice(versionIndex, 1);
            let nextVersionDescriptor: WorkflowVersionDescriptor = workflow.pickVersion(
              [workflow_version.version['version']]
            );
            this.logger.debug('Next version: ', nextVersionDescriptor);
            if (nextVersionDescriptor) {
              this.loadWorkflowVersion(
                workflow,
                nextVersionDescriptor.name
              ).subscribe(
                (wv: WorkflowVersion) => {
                  workflow.removeVersion(workflow_version);
                  workflow.addVersion(wv, true); //, true);
                  this.subjectWorkflows.next(this._workflows);
                },
                catchError((e) => {
                  this.setLoadingWorkflows(false);
                  throw e;
                })
              );
            } else {
              workflow.removeVersion(workflow_version);
              this.subjectWorkflows.next(this._workflows);
              this.setLoadingWorkflows(false);
            }
          }
          this.logger.debug('Workflow removed');
          return wd;
        }),
        catchError((err) => {
          this.logger.debug('Error when deleting workflow', err);
          this.setLoadingWorkflows(false);
          throw err;
        }),
        finalize(() => {
          // this.setLoadingWorkflows(false);
        })
      );
  }

  public deleteWorkflow(workflow: Workflow): Observable<{ uuid: string }> {
    if (!workflow) return;
    this.setLoadingWorkflows(true);
    return this.api.deleteWorkflow(workflow.uuid).pipe(
      map((wd: { uuid: string }) => {
        const workflowIndex = this.workflows.findIndex(
          (w) => w.uuid === workflow.uuid
        );
        this.logger.debug('Version index: ', workflowIndex);
        if (workflowIndex > -1) {
          this._workflows.splice(workflowIndex, 1);
          this.subjectWorkflows.next(this._workflows);
          this.logger.debug('Workflow removed');
        } else {
          this.logger.warn('Workflow not found', workflow);
        }
        return wd;
      }),
      catchError((err) => {
        this.logger.debug('Error when deleting workflow', err);
        this.setLoadingWorkflows(false);
        throw err;
      }),
      finalize(() => {
        this.setLoadingWorkflows(false);
      })
    );
  }

  public updateWorkflowName(
    w: Workflow
  ): Observable<{ meta: { modified: number } }> {
    return this.api.updateWorkflowName(w);
  }

  public updateSuite(suite: Suite): Observable<any> {
    return this.api.updateSuite(suite);
  }

  public updateTestInstance(instance: TestInstance): Observable<any> {
    return this.api.updateTestInstance(instance);
  }

  public changeWorkflowVisibility(w: WorkflowVersion): Observable<any> {
    return this.api.changeWorkflowVisibility(w);
  }

  public isEditable(workflow: WorkflowVersion): boolean {
    if (!this.currentUser || !workflow || !workflow.submitter) {
      return false;
    }
    return this.currentUser.id === workflow.submitter['id'] ? true : false;
  }

  private _selectWorkflowVersion(w: WorkflowVersion) {
    this.logger.debug('Selected workflow', w);
    this._workflow = w;
    this.subjectWorkflow.next(w);
  }

  public selectTestSuite(uuid: string) {
    if (this._suite && this._suite.uuid === uuid) {
      this._selectTestSuite(this._suite);
    } else if (!this._workflow) {
      this.api.getSuite(uuid).subscribe((suite: Suite) => {
        this._selectTestSuite(suite);
      });
    } else {
      let suite: Suite = this._workflow.suites.all.find(
        (s: Suite) => s.uuid === uuid
      ) as Suite;
      this._selectTestSuite(suite);
    }
  }

  private _selectTestSuite(suite: Suite) {
    this.logger.debug('Selected suite', suite);
    this._suite = suite;
    this.subjectTestSuite.next(suite);
  }

  public checkROCrateAvailability(
    workflow: WorkflowVersion
  ): Observable<boolean> {
    return this.api.checkROCrateAvailability(workflow);
  }

  public downloadROCrate(workflow: WorkflowVersion) {
    this.api.downloadROCrate(workflow).subscribe((data) => {
      const blob = new Blob([data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      window.open(url);
    });
  }

  public loadNotifications(): Observable<UserNotification[]> {
    return this.api.get_current_user_notifications().pipe(
      map((notifications: UserNotification[]) => {
        this._notifications = notifications;
        this.subjectNotifications.next(notifications);
        return notifications;
      }),
      catchError((err) => {
        this.logger.debug('Error', err);
        // this.setLoadingWorkflows(false);
        throw err;
      }),
      finalize(() => {
        // this.setLoadingWorkflows(false);
      })
    );
  }

  public setNotificationsReadingTime(
    notifications: UserNotification[]
  ): Observable<object> {
    return this.api.setNotificationsReadingTime(notifications);
  }

  public deleteNotification(
    notification: UserNotification
  ): Observable<object> {
    return this.api.deleteNotification(notification);
  }

  public deleteNotifications(
    notifications: UserNotification[]
  ): Observable<object> {
    return this.api.deleteNotifications(notifications);
  }

  ngOnDestroy() {
    // prevent memory leak when component destroyed
    for (let s of this.subscriptions) {
      s.unsubscribe();
    }
  }
}
