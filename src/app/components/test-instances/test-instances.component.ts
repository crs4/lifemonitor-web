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

import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MouseClickHandler } from 'src/app/models/common.models';
import { TestBuild } from 'src/app/models/testBuild.models';
import { TestInstance } from 'src/app/models/testInstance.models';
import { WorkflowVersion } from 'src/app/models/workflow.model';
import { Logger, LoggerManager } from 'src/app/utils/logging';
import { AppService } from 'src/app/utils/services/app.service';

declare var $: any;

const minWidthForListLayout: number = 768;

@Component({
  selector: 'test-instances',
  templateUrl: './test-instances.component.html',
  styleUrls: ['./test-instances.component.scss'],
})
export class TestInstancesComponent implements OnInit, OnChanges {
  @Input() workflow: WorkflowVersion;
  @Input() testInstances: TestInstance[];
  @Output() suiteSelected = new EventEmitter<TestInstance>();

  @ViewChild('instancesDataView')
  dataView: any;

  private enableAutoLayoutSwitch: boolean = false;
  private suiteInstancesDataTable: any;
  private clickHandler: MouseClickHandler = new MouseClickHandler();

  // initialize logger
  private logger: Logger = LoggerManager.create('TestInstancesComponent');

  constructor(
    private appService: AppService,
    private toast: ToastrService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (this.enableAutoLayoutSwitch) {
      if (window.innerWidth < minWidthForListLayout) {
        this.dataView.layout = 'grid';
      }
    }
  }

  ngAfterViewInit() {
    this.initDataTable();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.logger.debug('Change detected');
    this.cdr.detectChanges();
  }

  @HostListener('window:resize', ['$event'])
  onResize(event) {
    if (this.enableAutoLayoutSwitch) {
      this.logger.debug('Resize', event.target.innerWidth);
      if (event.target.innerWidth < minWidthForListLayout) {
        this.dataView.layout = 'grid';
        this.cdr.detectChanges();
      }
    }
  }

  public selectTestInstance(testInstance: TestInstance) {
    this.logger.debug('Selected TestInstace: ', testInstance);
  }

  public selectTestBuild(testBuild: TestBuild) {
    this.logger.debug('TestBuild', testBuild);
    if (testBuild) {
      this.logger.debug('Test Build selected', testBuild);
      // this.suiteSelected.emit(testBuild);
      window.open(testBuild.externalLink as string, '_blank');
      this.appService.selectWorkflowVersion(
        testBuild.testInstance.suite.workflow.uuid
      );
    }
  }

  private refreshDataTable() {
    this.destroyDataTable();
    this.initDataTable();
  }

  private initDataTable() {
    if (this.suiteInstancesDataTable) return;
    this.suiteInstancesDataTable = $('#suiteInstances').DataTable({
      paging: true,
      lengthChange: true,
      lengthMenu: [5, 10, 20, 50, 75, 100],
      searching: false,
      ordering: true,
      order: [[1, 'asc']],
      columnDefs: [
        {
          targets: [0, 3, 4],
          orderable: false,
        },
      ],
      info: true,
      autoWidth: true,
      responsive: false,
      deferRender: false,
      stateSave: true,
      // "scrollY": "520",
      scrollX: 1200,
      language: {
        search: '',
        searchPlaceholder: 'Filter your dashboard',
        decimal: '',
        emptyTable: 'No instances associated to the current test suite',
        info: 'Showing _START_ to _END_ of _TOTAL_ instances',
        infoEmpty: 'Showing 0 to 0 of 0 instances',
        infoFiltered: '(filtered from a total of _MAX_ instances)',
        infoPostFix: '',
        thousands: ',',
        lengthMenu: 'Show _MENU_ instances',
        loadingRecords: 'Loading instances...',
        processing: 'Processing instances...',
        zeroRecords: 'No matching instances found',
        paginate: {
          first: 'First',
          last: 'Last',
          next: 'Next',
          previous: 'Previous',
        },
        aria: {
          sortAscending: ': activate to sort column ascending',
          sortDescending: ': activate to sort column descending',
        },
      },
    });
    // Add tooltip to the SearchBox
    // $('input[type=search]')
    //   .attr('data-placement', 'top')
    //   .attr('data-toggle', 'tooltip')
    //   .attr('data-html', 'true')
    //   .attr('pTooltip', 'Filter by UUID or Name');
  }

  private destroyDataTable() {
    if (this.suiteInstancesDataTable) {
      this.suiteInstancesDataTable.destroy();
      this.suiteInstancesDataTable = null;
    }
  }

  public isUserLogged(): boolean {
    return this.appService.isUserLogged();
  }

  public isEditable(i: TestInstance) {
    return this.appService.isEditable(i && i.suite ? i.suite.workflow : null);
  }

  public enableTestInstanceEditing(instance: TestInstance) {
    this.clickHandler.doubleClick(() => {
      if (this.isUserLogged() && this.isEditable(instance)) {
        instance['oldName'] = instance.name;
        instance['editingMode'] = true;
      }
    });
  }

  public restoreTestInstance(instance: TestInstance) {
    instance.name = instance['oldName'];
    instance['editingMode'] = false;
  }

  public updateTestInstance(instance: TestInstance) {
    this.appService.updateTestInstance(instance).subscribe(
      () => {
        instance['editingMode'] = false;
        this.toast.success('Test instance updated!', '', { timeOut: 2500 });
      },
      (error) => {
        this.toast.error('Unable to update test instance', '', {
          timeOut: 2500,
        });
        this.logger.error(error);
      }
    );
  }

  public showTestInstanceDetails(instance: TestInstance) {
    this.clickHandler.click(() => {
      window.open(instance.externalLink, '_blank');
    });
  }
}
