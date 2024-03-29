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

import { DOCUMENT, Location, ViewportScroller } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  HostListener,
  Inject,
  NgZone,
  OnChanges,
  OnInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Observable, Subscription } from 'rxjs';
import { BaseDataViewComponent } from 'src/app/components/base-data-view/base-data-view.component';
import { MouseClickHandler } from 'src/app/models/common.models';
import {
  AggregatedStatusStats,
  AggregatedStatusStatsItem,
  AggregatedTestStatusMap,
} from 'src/app/models/stats.model';
import { TestBuild } from 'src/app/models/testBuild.models';
import { User } from 'src/app/models/user.modes';
import {
  Workflow,
  WorkflowVersion,
  WorkflowsLoadingStatus,
} from 'src/app/models/workflow.model';
import { ItemFilterPipe } from 'src/app/utils/filters/item-filter.pipe';
import { Logger, LoggerManager } from 'src/app/utils/logging';
import { AppService } from 'src/app/utils/services/app.service';
import { InputDialogService } from 'src/app/utils/services/input-dialog.service';
import { WorkflowUploaderService } from 'src/app/utils/services/workflow-uploader.service';
import { StatsFilterPipe } from './../../utils/filters/stats-filter.pipe';

declare var $: any;

const minWidthForListLayout: number = 768;

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent
  extends BaseDataViewComponent
  implements OnInit, OnChanges, AfterViewInit {
  private _workflows: Workflow[] = null;
  // reference to workflows stats
  private _workflowStats: AggregatedStatusStats | null;
  // reference to the current subscriptions
  private workflowsStatsSubscription: Subscription;
  private workflowUpdateSubscription: Subscription;
  private workflowLoadingSubscription: Subscription;
  private workflowsLoadingSubscription: Subscription;
  private userLoggedSubscription: Subscription;
  private internalParamsSubscription: Subscription;
  private queryParamsSubscription: Subscription;
  private internalParamSubscription: Subscription;
  private appReadySubscription: Subscription;
  //
  private filteredWorkflows: AggregatedStatusStatsItem[] | null;

  //
  public statusFilter: string | null;
  public _workflowNameFilter: string = '';
  public workflowSortingOrder: string = 'desc';
  public editModeEnabled: boolean = false;
  private _searchModeEnabled: boolean = false;
  private openUploader: boolean = false;
  _browseButtonEnabled: boolean = false;

  private statsFilter = new StatsFilterPipe();
  private itemFilter = new ItemFilterPipe();

  // Reference to the dataTable instance
  private workflowDataTable: any = null;

  public updatingDataTable: boolean = false;

  private enableAutoLayoutSwitch: boolean = false;

  private loadingWorkflows: boolean = false;
  private loadingWorkflowVersions = [];
  private loadingWorkflowVersionMap: { [uuid: string]: boolean } = {};

  private clickHandler: MouseClickHandler = new MouseClickHandler();

  tooltipShowDelay = 1500;

  // Sort configuration
  sortField: string;
  sortOrder: number;
  sortKey: string;
  sortCriterion: { field: string; order: number };
  sortOptions = [
    {
      label: 'name',
      value: { field: 'name', order: 1 },
      iconClass: 'fas fa-sort-amount-up-alt', //'fas fa-align-left',
      description: 'order by name (ascending order)',
    },
    {
      label: 'name',
      value: { field: 'name', order: -1 },
      iconClass: 'fas fa-sort-amount-down-alt', //'fas fa-align-right',
      description: 'order by name (descending order)',
    },
    {
      label: 'creation time',
      value: { field: 'created', order: 1 },
      iconClass: 'fas fa-sort-amount-up-alt', //'pi pi-clock',
      description: 'order by creation time (ascending order)',
    },
    {
      label: 'creation time',
      value: { field: 'created', order: -1 },
      iconClass: 'fas fa-sort-amount-down-alt', //'pi pi-clock',
      description: 'order by creation time (descending order)',
    },
    {
      label: 'modification time',
      value: { field: 'modified', order: 1 },
      iconClass: 'fas fa-sort-amount-up-alt', //'fas fa-sort-amount-up-alt', //'pi pi-stopwatch',
      description: 'order by modification time (ascending order)',
    },
    {
      label: 'modification time',
      value: { field: 'modified', order: -1 },
      iconClass: 'fas fa-sort-amount-down-alt', //'pi pi-stopwatch',
      description: 'order by modification time (descending order)',
    },
  ];

  // initialize logger
  private logger: Logger = LoggerManager.create('DashboardComponent');

  @ViewChild('workflowsDataView')
  dataView: any;

  workflowsLoadingStatus$: Observable<WorkflowsLoadingStatus>;

  constructor(
    private location: Location,
    private cdref: ChangeDetectorRef,
    private appService: AppService,
    private toastService: ToastrService,
    private router: Router,
    private route: ActivatedRoute,
    private inputDialog: InputDialogService,
    private uploaderService: WorkflowUploaderService,
    protected ngZone: NgZone,
    protected readonly viewport: ViewportScroller,
    @Inject(DOCUMENT) protected readonly document: Document
  ) {
    super(viewport, document);
    this.workflowsLoadingStatus$ = this.appService.observableLoadingWorkflowsStatus;
  }

  ngOnInit() {
    this.logger.debug('Dashboard Created!!');

    this.initDashboard();
    this.appReadySubscription = this.appService
      .notifyWhenReady()
      .subscribe((ready: boolean) => {
        if (ready) {
          this.logger.debug('App is ready!');
        }
      });
  }

  private initDashboard(): void {
    this.logger.debug('Initializing dashboard...');
    this.userLoggedSubscription = this.appService.observableUser.subscribe(
      (user: User) => {
        // don't load workflows if user is not logged
        if (user === undefined) return;
        // load workflows
        const isUserLogged = user !== null;
        if (this._workflowStats) this._workflowStats.clear();
        this.updatingDataTable = true;
        this.appService
          .loadWorkflows(false, isUserLogged, isUserLogged)
          .subscribe((data) => {
            this.logger.debug('Loaded workflows ', data);
          });
      }
    );
    this.workflowsStatsSubscription = this.appService.observableWorkflows.subscribe(
      (workflows: Workflow[]) => {
        this.logger.debug('Loaded subscriptions for workflows: ', workflows);
        this.prepareTableData(workflows);
      }
    );

    this.workflowUpdateSubscription = this.appService.observableWorkflowUpdate.subscribe(
      (wv: WorkflowVersion) => {
        this.prepareTableData();
      }
    );

    this.workflowLoadingSubscription = this.appService.observableLoadingWorkflow.subscribe(
      (w) => {
        this.loadingWorkflowVersionMap[w.uuid] = w.loading;
      }
    );

    this.queryParamsSubscription = this.route.queryParams.subscribe(
      (params) => {
        this.logger.debug('Query params: ', params);
        if ('status' in params) {
          // Parse and normalize status filter
          let status: string = params['status'].toLowerCase();
          this.logger.debug('Status: ', status);
          for (let s in AggregatedTestStatusMap) {
            if (s === status || AggregatedTestStatusMap[s].includes(status)) {
              this.statusFilter = s;
            }
          }
        }
      }
    );

    this.internalParamSubscription = this.route.params.subscribe((params) => {
      this.logger.debug('Dashboard params:', params);
      if (params['add'] == 'true') {
        this.openUploader = true;
        this.location.replaceState('/dashboard');
      }
    });
    this.logger.debug('Initializing workflow data!!');
    this._workflows = this.appService.workflows;
    this._workflowNameFilter = '';
    this.updatingDataTable = true;
    if (this._workflows) {
      this.prepareTableData();
    } else {
      this.logger.debug('Loading workflows from dashboard init');
      // if (!this.appService.isLoadingWorkflows()) {
      //   this.appService.checkIsUserLogged().then((isUserLogged) => {
      //     this.updatingDataTable = true;
      //     if (this._workflowStats) this._workflowStats.clear();
      //     if (this.openUploader === true) this.openWorkflowUploader();
      //     this.appService.clearListOfWorkflows().then(() => {
      //       this.appService
      //         .loadWorkflows(false, isUserLogged, isUserLogged)
      //         .subscribe((data) => {
      //           this.logger.debug('Loaded workflows ', data);
      //           // alert('Loaded workflows from dashboard init');
      //         });
      //     });
      //   });
      // } //else alert('Already loading workflows');
    }
    // Reload page when the swipe-down event is detected
    document.addEventListener('swiped-down', (e: any) => {
      this.refreshDashboard();
    });
  }

  refreshDashboardByPageReload(): void {
    window.location.reload();
    this.logger.debug('Refreshing dashboard...');
  }

  refreshDashboard(): void {
    this.logger.debug('Refreshing dashboard...', this.dataView);
    this.appService.setLoadingWorkflows(true);
    const viewWorkflows = [...(this.dataView?.value as WorkflowVersion[])];
    while (viewWorkflows.length > 0) {
      const page = viewWorkflows.splice(0, this.dataView.rows);
      this.appService.refreshWorkflowsList(page).then(() => {
        this.logger.debug('Refreshed page...', page);
      });
    }
    this.appService.setLoadingWorkflows(false);
  }

  refreshWorkflow(wf: WorkflowVersion): void {
    this.appService.refreshWorkflowVersion({
      uuid: wf.uuid,
      version: wf.version['version'],
    });
  }

  ngAfterViewChecked() {
    // alert("After view checked")
    this.checkWindowSize();
  }

  get isSmallScreen(): boolean {
    return window.matchMedia('(max-width: 576px)').matches;
  }

  get windowWidth(): number {
    return window.innerWidth;
  }

  ngAfterViewInit(): void {
    // $('[data-toggle="tooltip"]', function () {
    //   $(this).tooltip('hide');
    // });

    const mediaQuery = window.matchMedia('(max-width: 576px)');
    mediaQuery.addEventListener('change', (e) => {
      this.updateLayout();
    });

    this.updateLayout();
  }

  onSortChangeEvent(event: any) {
    return this.onSortChange(event.value);
  }

  onSortChange(criterion: { field: string; order: number }) {
    this.sortCriterion = criterion;
    this.sortField = criterion.field;
    this.sortOrder = criterion.order;
    this.logger.debug('Update sort criterion', criterion);
  }

  getCriterionDescription() {
    const criterion = this.sortOptions.find(
      (c) => c.value === this.sortCriterion
    );
    return criterion?.description;
  }

  get currentLayout(): string {
    return this.dataView?.layout;
  }

  private updateLayout(): void {
    if (this.enableAutoLayoutSwitch) {
      if (this.dataView) {
        this.dataView.layout = this.isSmallScreen ? 'grid' : 'list';
        this.cdref.detectChanges();
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // $('[data-toggle="tooltip"]', function () {
    //   $(this).tooltip('hide');
    // });
  }

  @HostListener('window:resize', ['$event'])
  onResize(event) {
    if (this.enableAutoLayoutSwitch) {
      this.logger.debug('Resize', event.target.innerWidth);
      if (event.target.innerWidth < minWidthForListLayout) {
        this.dataView.layout = 'grid';
        this.cdref.detectChanges();
      }
    }
  }

  private checkWindowSize() {
    if (this.enableAutoLayoutSwitch) {
      if (this.dataView && window.innerWidth < minWidthForListLayout) {
        this.dataView.layout = 'grid';
      }
    }
  }

  public get workflowNameFilter(): string {
    return this._workflowNameFilter;
  }

  public get browseButtonEnabled(): boolean {
    return this._browseButtonEnabled;
  }

  public set browseButtonEnabled(value: boolean) {
    this.setBrowseButtonEnabled(value);
  }

  public setBrowseButtonEnabled(value: boolean) {
    this._browseButtonEnabled = value;
    if (!this._browseButtonEnabled) this._workflowNameFilter = '';
    this._searchModeEnabled = this._browseButtonEnabled;
    if (this._browseButtonEnabled)
      this.appService.loadWorkflows(false, false, true).subscribe((data) => {
        this.logger.debug('Loaded workflows ', data);
        // alert('Loading from user logged ');
      });
  }

  public goToFirstPage() {
    $('.p-paginator-first').click();
  }

  public onChangeLayout(event: any) {
    // this.editModeEnabled = false;
    // this.workflows?.forEach((w) => {
    //   w['editMode'] = false;
    //   w['editSubscription'] = false;
    // });
  }

  public set workflowNameFilter(value: string) {
    this._workflowNameFilter = value ? value.replace('SEARCH_KEY###', '') : '';
    this.editModeEnabled = false;
    this.prepareTableData();
    // reset dataview paginator
    this.goToFirstPage();
  }

  public get isLoading(): Observable<boolean> {
    return this.appService.isLoadingWorkflowsAsObservable;
  }

  public isUserLogged(): boolean {
    return this.appService.isUserLogged();
  }

  public openWorkflowUploader() {
    this.uploaderService.show({
      title: 'Register Workflow',
      iconClass: 'fas fa-cogs',
      iconClassSize: 'fa-7x',
      iconImage: null,
    });
  }

  public openWorkflowVersionUploader(workflow: Workflow) {
    this.uploaderService.show({
      iconImage: '/assets/icons/branch-add-eosc-green.png',
      title: 'Register new version of <br><b>"' + workflow.name + '"</b>',
      workflowUUID: workflow.uuid,
      workflowName: workflow.name,
    });
  }

  public editModeToggle() {
    this.editModeEnabled = !this.editModeEnabled;
    this.logger.debug('Edit mode enabled: ' + this.editModeEnabled);
  }

  public get searchModeEnabled(): boolean {
    // return this.workflowNameFilter && this.workflowNameFilter.length > 0;
    return this._searchModeEnabled;
  }

  public isEditable(w: WorkflowVersion) {
    return this.appService.isEditable(w);
  }

  public updateSelectedVersion(workflow_version: WorkflowVersion) {
    this.logger.debug('Updated workflow version', workflow_version);
    this.prepareTableData();
    this.logger.debug('The current datatable: ', this.workflowDataTable);
  }

  public isLoadingWorkflowVersion(workflow: Workflow) {
    // return workflow && this.loadingWorkflowVersions.indexOf(workflow.uuid) >= 0;
    return this.loadingWorkflowVersionMap[workflow.uuid] ?? false;
  }

  public loadingWorkflowVersion(workflow: Workflow) {
    if (workflow) {
      this.loadingWorkflowVersions.push(workflow.uuid);
    } else {
      let i = this.loadingWorkflowVersions.indexOf(workflow.uuid);
      if (i >= 0) {
        this.loadingWorkflowVersions.splice(i, 1);
      }
    }
  }

  public deleteWorkflowVersion(w: WorkflowVersion) {
    this.logger.debug('Deleting workflow version....', w);
    this.inputDialog.show({
      iconImage: '/assets/icons/branch-delete-eosc-green.png',
      iconImageSize: '160',
      description:
        'Delete version <b>"' +
        w.version['version'] +
        '"</b><br/> of workflow <b>' +
        w.name +
        '</b>?',
      onConfirm: () => {
        // this.updatingDataTable = true;
        this.appService.deleteWorkflowVersion(w).subscribe(
          (wd: { uuid: string; version: string }) => {
            this.logger.debug('Workflow deleted', wd);
            this.toastService.error(
              '',
              `${w.name} (ver. ${w.version['version']}) deleted`,
              { timeOut: 5000 }
            );
          },
          (error) => {
            this.logger.error(error);
            this.updatingDataTable = false;
            this.toastService.error(`Unable to delete workflow version`);
          }
        );
      },
    });
  }

  public deleteWorkflow(w: Workflow) {
    this.logger.debug('Deleting workflow ....', w);
    this.inputDialog.show({
      iconClass: 'fas fa-trash-alt',
      description: 'Delete workflow <b>' + w.name + '</b>?',
      onConfirm: () => {
        this.updatingDataTable = true;
        this.appService.deleteWorkflow(w).subscribe(
          (wd: { uuid: string; version: string }) => {
            this.logger.debug('Workflow deleted', wd);
            this.toastService.error('', `${w.name} (${w.uuid}) deleted`, {
              timeOut: 5000,
            });
          },
          (error) => {
            this.logger.error(error);
            this.updatingDataTable = false;
            this.toastService.error('Unable to delete workflow');
          }
        );
      },
    });
  }

  public subscribeWorkflow(w: WorkflowVersion) {
    this.logger.debug('Subscribing to workflow: ', w);
    this.appService.subscribeWorkflow(w).subscribe((w) => {
      this.logger.debug('Workflow subscription created!');
    });
  }

  public unsubscribeWorkflow(w: WorkflowVersion) {
    this.logger.debug('Unsubscribing from workflow: ', w);
    this.appService.unsubscribeWorkflow(w).subscribe((w) => {
      this.logger.debug('Workflow subscription deleted!');
      this.filteredWorkflows = this.searchModeEnabled
        ? this._workflowStats.all
        : this._workflowStats.all.filter(
            (v) => v.subscriptions && v.subscriptions.length > 0
          );
    });
  }

  public getWorkflowVisibilityTitle(w: WorkflowVersion) {
    return (
      "<span class='text-xs'><i class='fas fa-question-circle mx-1'></i>" +
      (w.public ? 'public' : 'private') +
      ' workflow</span>'
    );
  }

  public restoreWorkflowName(w: WorkflowVersion) {
    w.name = w['oldNameValue'];
    w['editingMode'] = false;
  }

  public showWorkflowDetails(w: WorkflowVersion) {
    this.clickHandler.click(() => {
      this.router.navigate([
        '/workflow',
        { uuid: w.asUrlParam(), version: w.version['version'] },
      ]);
    });
  }

  public isEnabledWorkflowEditMode(w: WorkflowVersion): boolean {
    return w && w['editingMode'];
  }

  public isEnabledWorkflowEditSubscriptionMode(w: WorkflowVersion): boolean {
    return w && w['editSubscription'];
  }

  public enableWorkflowEditMode(w: WorkflowVersion) {
    this.clickHandler.doubleClick(() => {
      if (this.isUserLogged()) {
        if (this.isEditable(w)) {
          w['oldNameValue'] = w.name;
          w['clickOnInputBox'] = false;
          w['editingMode'] = true;
          w['editSubscription'] = true;
        } else {
          w['editSubscription'] = true;
        }
      }
    });
  }

  public disableWorkflowEditMode(w: WorkflowVersion) {
    if (this.isUserLogged()) {
      if (this.isEditable(w)) {
        w['oldNameValue'] = w.name;
        w['clickOnInputBox'] = false;
        w['editingMode'] = false;
        w['editSubscription'] = false;
      } else {
        w['editSubscription'] = false;
      }
    }
  }

  public updateWorkflowName(w: WorkflowVersion) {
    this.logger.debug('Updating workflow name', w);
    this.appService.updateWorkflowName(w.workflow).subscribe(
      (data) => {
        this.toastService.success(
          `Workflow ${w.uuid} (ver. ${w.version['version']}) updated!`,
          '',
          {
            timeOut: 2500,
          }
        );
        w['editingMode'] = false;
      },
      (error) => {
        this.toastService.error('Unable to update workflow', '', {
          timeOut: 2500,
        });
        this.logger.error(error);
      }
    );
  }

  public changeVisibility(w: WorkflowVersion) {
    this.inputDialog.show({
      iconClass: !w.public
        ? 'fas fa-lg fa-globe-americas'
        : 'fas fa-lg fa-user-lock',
      description:
        'Change visibility to <b>' +
        (!w.public ? 'public' : 'private') +
        '</b>?',
      confirmText: 'Confirm',
      onConfirm: () => {
        this.appService.changeWorkflowVisibility(w).subscribe(
          () => {
            $('.workflow-visibility-' + w.uuid)
              .tooltip('hide')
              .attr('data-original-title', this.getWorkflowVisibilityTitle(w))
              .tooltip('show');
            this.toastService.success('Workflow visibility updated!', '', {
              timeOut: 2500,
            });
          },
          (error) => {
            this.toastService.error(
              'Unable to change workflow visibility',
              '',
              { timeOut: 2500 }
            );
            this.logger.error(error);
          }
        );
      },
    });
  }

  public selectTestBuild(testBuild: TestBuild) {
    this.logger.debug('Test Build selected', testBuild);
    if (testBuild.externalLink)
      window.open(testBuild.externalLink as string, '_blank');
  }

  public get workflowStats(): AggregatedStatusStats {
    return this._workflowStats;
  }

  public getStatsLength(workflows: AggregatedStatusStatsItem[]): number {
    let items = workflows;
    if (
      this._workflowNameFilter &&
      this._workflowNameFilter !== '______ALL_____'
    ) {
      items = items.filter(
        (v) =>
          v.name
            .toLowerCase()
            .indexOf(this._workflowNameFilter.toLowerCase()) >= 0 ||
          v.uuid
            .toLowerCase()
            .indexOf(this._workflowNameFilter.toLowerCase()) >= 0
      );
    }
    if (this.isUserLogged() && !this.browseButtonEnabled)
      items = items.filter(
        (v) => v.subscriptions && v.subscriptions.length > 0
      );

    return items.length;
  }

  public get workflows(): AggregatedStatusStatsItem[] {
    return this.filteredWorkflows;
  }

  public filterWorkflows($event: any, workflows: AggregatedStatusStatsItem[]) {
    this.logger.debug($event);
    this.filteredWorkflows = workflows;
  }

  public selectWorkflowVersion(version: any) {
    this.logger.debug('Selected workflow version:', version);
  }

  public filterByStatus(status: string, asToggle: boolean = true) {
    this.logger.debug('Filter by status', status);
    if (!this._workflowStats) return;
    try {
      status = status == 'any' ? 'all' : status;
      if (status != this.statusFilter || !asToggle) {
        this.filteredWorkflows =
          !this.isUserLogged() || this.searchModeEnabled
            ? this._workflowStats[status]
            : this._workflowStats[status].filter(
                (v: { subscriptions: string | any[] }) =>
                  v.subscriptions && v.subscriptions.length > 0
              );
        this.statusFilter = status;
        // this.refreshDataTable();
      } else {
        this.filteredWorkflows =
          !this.isUserLogged() || this.searchModeEnabled
            ? this._workflowStats['all']
            : this._workflowStats['all'].filter(
                (v: { subscriptions: string | any[] }) =>
                  v.subscriptions && v.subscriptions.length > 0
              );
        this.statusFilter = null;
        // remove status params from query if defined
        const queryParams = { ...this.route.snapshot.queryParams };
        delete queryParams.status;
        this.router.navigate([], { queryParams: queryParams });
        // this.refreshDataTable();
      }
    } catch (e) {
      this.logger.debug(e);
    }
  }

  private prepareTableData(workflows: Workflow[] = null) {
    workflows = workflows || this._workflows;
    if (!workflows || typeof workflows === 'undefined') return;

    this.logger.debug('Loaded workflows: ', workflows);
    // Initialize workflow stats
    let stats = new AggregatedStatusStats();

    workflows.forEach((w: Workflow) => {
      if (w.currentVersion) {
        if (
          !this.appService.isUserLogged() ||
          this._browseButtonEnabled ||
          (w.currentVersion.subscriptions &&
            w.currentVersion.subscriptions.length > 0)
        )
          stats.add(w.currentVersion);
      }
    });
    this.logger.debug('Initialized Stats', stats);

    if (stats) {
      this._workflowStats = this.statsFilter.transform(
        stats,
        this._workflowNameFilter
      );

      if (this.statusFilter) {
        this.filterByStatus(this.statusFilter, false);
      } else {
        this.filteredWorkflows =
          // this.searchModeEnabled || !this.isUserLogged()
          this.browseButtonEnabled || !this.isUserLogged()
            ? stats.all
            : stats.all.filter(
                (v) => v.subscriptions && v.subscriptions.length > 0
              );
      }
    }

    this._workflowStats = stats;
    this._workflows = workflows;

    document['workflows'] = workflows;

    //
    this.updatingDataTable = false;

    this.checkWindowSize();

    // this.scrollTop();

    this.cdref.detectChanges();
  }

  public get layout(): string {
    return this.dataView?.layout ?? 'list';
  }

  ngOnDestroy() {
    // prevent memory leak when component destroyed
    if (this.appReadySubscription) this.appReadySubscription.unsubscribe();
    if (this.workflowsStatsSubscription)
      this.workflowsStatsSubscription.unsubscribe();
    if (this.internalParamsSubscription)
      this.internalParamsSubscription.unsubscribe();
    if (this.queryParamsSubscription)
      this.queryParamsSubscription.unsubscribe();
    if (this.userLoggedSubscription) this.userLoggedSubscription.unsubscribe();

    if (this.workflowLoadingSubscription)
      this.workflowLoadingSubscription.unsubscribe();
    if (this.workflowUpdateSubscription)
      this.workflowUpdateSubscription.unsubscribe();
    this.logger.debug('Destroying dashboard component');
  }
}
