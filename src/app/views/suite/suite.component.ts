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

import { DOCUMENT, ViewportScroller } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  Inject,
  Input,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { BaseDataViewComponent } from 'src/app/components/base-data-view/base-data-view.component';
import { StatusStatsItem, TestStatus } from 'src/app/models/stats.model';
import { Suite } from 'src/app/models/suite.models';
import { WorkflowVersion } from 'src/app/models/workflow.model';
import { Logger, LoggerManager } from 'src/app/utils/logging';
import { AppService } from 'src/app/utils/services/app.service';

@Component({
  selector: 'test-suite',
  templateUrl: './suite.component.html',
  styleUrls: ['./suite.component.scss'],
})
export class SuiteComponent extends BaseDataViewComponent implements OnInit {
  @Input() suite: Suite;

  public statusFilter: string = null;
  private _instanceNameFilter: string = '';
  public instanceSortingOrder: string = 'desc';

  private _instances: StatusStatsItem[] = [];

  private paramSubscription: Subscription;
  private queryParamsSubscription: Subscription;
  private workflowSubscription: Subscription;
  private suiteSubscription: Subscription;

  // initialize logger
  private logger: Logger = LoggerManager.create('SuiteComponent');

  constructor(
    private route: ActivatedRoute,
    private appService: AppService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    protected readonly viewport: ViewportScroller,
    @Inject(DOCUMENT) protected readonly document: Document
  ) {
    super(viewport, document);
  }

  ngOnInit() {
    this.logger.debug('Created component Workflow');
    this.paramSubscription = this.route.params.subscribe((params) => {
      this.logger.debug('Params:', params);

      let urlData = this.appService.decodeUrl(params['s']);
      this.logger.debug('UrlData', urlData);

      this.queryParamsSubscription = this.route.queryParams.subscribe(
        (params) => {
          this.logger.debug('Query params: ', params);
          if ('status' in params) {
            // Parse and normalize status filter
            let status: string = params['status'].toLowerCase();
            this.logger.debug('Status: ', status);
            if (TestStatus.includes(status)) {
              this.statusFilter = status;
            }
          }
        }
      );

      // subscribe for the current selected workflow
      this.workflowSubscription = this.appService.observableWorkflow.subscribe(
        (w: WorkflowVersion) => {
          this.logger.debug('Changed workflow', w, w.suites);

          // subscribe for the current selected suite
          this.suiteSubscription = this.appService.observableTestSuite.subscribe(
            (suite: Suite) => {
              this.logger.debug('Changed suite', suite);
              if (suite) {
                this.suite = suite;
                this.suite.workflow = w;
                if (!this.statusFilter) this._instances = suite.instances.all;
                else this._instances = this.suite.instances[this.statusFilter];
                this.appService
                  .refreshWorkflowVersion(
                    {
                      uuid: w.uuid,
                      version: w.version['version'],
                    },
                    false
                  )
                  .then(() => {
                    this.logger.debug("Workflow's version refreshed");
                  });
              }
            }
          );

          // // select the suite with uuid = params['uuid']
          this.appService.selectTestSuite(urlData['suite']);
        }
      );

      // select a workflow
      this.appService.selectWorkflowVersion(
        urlData['workflow'],
        urlData['version']
      );
    });
  }

  public filterByStatus(status: string) {
    if (!this.suite) return;
    try {
      status = status == 'any' ? 'all' : status;
      if (status != this.statusFilter) {
        this._instances = this.suite.instances[status];
        this.statusFilter = status;
        this.instanceNameFilter = '';
      } else {
        this._instances = this.suite.instances['all'];
        this.statusFilter = null;
        // remove status params from query if defined
        const queryParams = { ...this.route.snapshot.queryParams };
        delete queryParams.status;
        this.router.navigate([], { queryParams: queryParams });
      }
    } catch (e) {
      this.logger.debug(e);
    }
  }

  public get instanceNameFilter(): string {
    return this._instanceNameFilter;
  }

  public set instanceNameFilter(value: string) {
    this._instanceNameFilter = value ? value.replace('SEARCH_KEY###', '') : '';
  }

  public get instances(): StatusStatsItem[] {
    return this._instances;
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.logger.debug('Change detected');
    this.cdr.detectChanges();
  }

  ngOnDestroy() {
    // prevent memory leak when component destroyed
    if (this.paramSubscription) this.paramSubscription.unsubscribe();
    if (this.queryParamsSubscription)
      this.queryParamsSubscription.unsubscribe();
    if (this.suiteSubscription) this.suiteSubscription.unsubscribe();
    if (this.workflowSubscription) this.workflowSubscription.unsubscribe();
    // this.workflowChangesSubscription.unsubscribe();
  }
}
