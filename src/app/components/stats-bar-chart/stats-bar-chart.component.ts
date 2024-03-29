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
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { Router } from '@angular/router';
import { BarElement, ChartData, ChartDataset } from 'chart.js';
import { Subscription } from 'rxjs';
import { DateUtils } from 'src/app/models/common.models';
import { StatusStatsItem } from 'src/app/models/stats.model';
import { TestBuild } from 'src/app/models/testBuild.models';
import { Logger, LoggerManager } from 'src/app/utils/logging';

import { formatDuration } from 'src/app/utils/shared/utils';

@Component({
  selector: 'stats-bar-chart',
  templateUrl: './stats-bar-chart.component.html',
  styleUrls: ['./stats-bar-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsBarChartComponent
  implements OnInit, OnChanges, AfterViewChecked {
  @Input() stats!: StatusStatsItem[];
  @Input() chartWidth: string = '340px';
  @Input() chartHeight: string = '200px';
  @Input() showTitle: boolean = true;
  @Output() selectedItem = new EventEmitter<StatusStatsItem>();

  // initialize logger
  private logger: Logger = LoggerManager.create('StatsBarChartComponent');

  basicData: any;

  basicOptions: any;

  basicDatasets: Array<any>;

  // duration stsatistics
  minDuration: number;
  maxDuration: number;
  averageDuration: number;

  subscription: Subscription;

  public selectedObject: StatusStatsItem;

  public barChartData: ChartDataset[] = [];

  public barColors = [];

  private colorMap = {
    passed: { color: '#1f8787' },
    error: { color: '#ffc107' },
    failed: { color: '#dc3545' },
    waiting: { color: '#fd7e14' },
    running: { color: '#17a2b8' },
    aborted: { color: '#6c757d' },
  };

  constructor(private router: Router, private zone: NgZone) {}

  ngOnInit(): void {
    // initialize datasets
    this.initializeDatasets();
    // initialize options
    this.basicOptions = this.setOptions();
  }

  ngAfterViewChecked(): void {}

  ngOnChanges(changes: SimpleChanges): void {
    this.zone.runOutsideAngular(() => {
      this.initializeDatasets();
    });
  }

  public getItemByIndex(index: number): any {
    return this.basicData[0]?.data[index];
  }

  public getTestBuildByName(name: string): any {
    return this.stats.find((item) => item.name === name);
  }

  public getItemTestBuild(tooltipItem: any, data: ChartData): TestBuild {
    if (!tooltipItem || !data) return null;
    this.logger.debug('item, data', tooltipItem, data);
    let index = tooltipItem['datasetIndex'];
    return this.stats[index] as TestBuild;
  }

  private setOptions(): any {
    return {
      interaction: {
        intersect: true,
        mode: 'nearest',
      },
      plugins: {
        title: {
          display: this.showTitle,
          position: 'top',
          text: 'Latest Test Builds',
        },
        legend: {
          labels: {
            // color: '#495057',
            font: { size: 8, weight: 'normal' },
            textAlign: 'right',
            // filter: (legendItem, chartData) => {
            //   return legendItem.text !== 'Test builds';
            // },
            boxWidth: 10,
            useBorderRadius: true,
            sort: (a: any, b: any) => {
              // sort legend items descending by datasetIndex
              return b.datasetIndex < a.datasetIndex ? 1 : -1;
            },
          },

          display: (ctx) => {
            return true;
          },
          // maxHeight: 100,
          position: 'bottom',
          align: 'center',
          onClick: (e, legendItem) => {
            this.logger.debug('legend click event', e);
            this.logger.debug('legendItem', legendItem);
            // const build = this.getTestBuildByName(legendItem.text);
            // this.selectedItem.emit(build);
            const dataset = this.basicDatasets[legendItem.datasetIndex];
            this.logger.debug('click on dataset legend', dataset);
            dataset.hidden = !dataset.hidden;
            e.chart.update();
          },
        },
        tooltip: {
          enabled: true,
          position: 'nearest',
          usePointStyle: true,
          backgroundColor: 'rgba(6, 55, 55, 0.9)',
          titleFont: { weight: 'bold', size: 12 },
          bodyFont: { size: 13, weight: 'bold' },
          footerFont: { weight: 'normal', color: 'gray' },
          callbacks: {
            title: (tooltipItem: Array<any>) => {
              this.logger.debug('tooltipItem', tooltipItem);
              // extract the index of the dataset (fix ts2532)
              const datasetIndex = tooltipItem[0].datasetIndex;
              // get the dataset by index
              const dataset = this.basicDatasets[datasetIndex];

              if (datasetIndex < 6) {
                const dataIndex = tooltipItem[0].dataIndex;
                if (!dataset.builds || !dataset.builds[dataIndex]) return null;
                const build = dataset.builds[dataIndex];
                return `⚙️ Build ${build.name}`;
              }

              return `⌛️ ${tooltipItem[0].dataset.label}`;
            },
            label: (tooltipItem: any) => {
              // this.logger.warn('tooltipItem', tooltipItem);
              if (tooltipItem.raw === null) return;
              // extract the index of the dataset (fix ts2532)
              const dataIndex = tooltipItem.dataIndex;
              // get the dataset by index
              const dataset = tooltipItem.dataset;
              if (!dataset || !dataset.builds)
                return formatDuration(tooltipItem.raw);
              const build = dataset.builds[dataIndex];
              return ` ${build.status}`;
            },

            labelColor: (tooltipItem: any) => {
              this.logger.warn('tooltipItem', tooltipItem);
              // extract the index of the dataset (fix ts2532)
              const dataIndex = tooltipItem.dataIndex;
              // get the dataset by index
              const dataset = tooltipItem.dataset;
              const lColor =
                typeof dataset.backgroundColor === 'string' ||
                dataset.backgroundColor instanceof String
                  ? dataset.borderColor
                  : dataset.backgroundColor[dataIndex];
              return {
                borderColor: lColor,
                backgroundColor: lColor,
                borderWidth: 2,
                borderDash: [2, 2],
                borderRadius: 2,
              };
            },

            beforeFooter: (tooltipItem: any) => {
              // extract the index of the dataset (fix ts2532)
              const dataIndex = tooltipItem[0].dataIndex;
              // get the dataset by index
              const dataset = tooltipItem[0].dataset;
              if (!dataset || !dataset.builds) return null;
              const build = dataset.builds[dataIndex];
              return `⏱️ created: ${DateUtils.formatTimestamp(
                build.timestamp.toString()
              )}`;
            },

            footer: (tooltipItem: any) => {
              if (!tooltipItem || tooltipItem.length === 0) return null;
              if (tooltipItem[0].datasetIndex > 2) return null;
              return `⌛️ duration: ${formatDuration(tooltipItem[0].raw)}`;
            },

            afterFooter: (tooltipItem: []) => {
              return '🔗 click to see more';
            },
          },
        },
      },

      scales: {
        x: {
          display: false,
          ticks: {
            color: '#495057',
            min: 0,
          },
          grid: {
            color: '#ebedef',
          },
        },
        y1: {
          display: true,
          position: 'left',
          ticks: {
            beginAtZero: true,
            display: false,
            min: 0,
          },

          // grid line settings
          grid: {
            drawOnChartArea: false, // only want the grid lines for one axis to show up
          },
          time: { unit: 'second' },
          title: {
            display: true,
            text: 'duration [hh:mm:ss]',
            color: '#034545',
            font: {
              size: 10,
              weight: 'bold',
              lineHeight: 1.2,
            },
            padding: { top: 20, left: 0, right: 0, bottom: 0 },
          },
        },
        y: {
          position: 'right',
          suggestedMin: this.minDuration,
          suggestedMax: this.maxDuration,
          ticks: {
            color: '#495057',
            min: 0,
            beginAtZero: true,
            label: 'duration (seconds)',
            display: true,
            font: { size: 7, weight: 'normal' },
            callback: function (val: number, index: number) {
              // Hide the label of every 2nd dataset
              return formatDuration(val);
              // return val;
            },
          },
          grid: {
            color: '#ebedef',
          },
          display: true,
          time: { unit: 'second' },
        },
      },
    };
  }

  initializeDatasets() {
    this.basicDatasets = [];

    const datasets = [];
    for (const statusType in this.colorMap) {
      const dataset = {
        builds: [...this.stats],
        get data(): [] {
          return this['builds'].map((b: TestBuild) =>
            [statusType].find((s) => s === b.status) ? b.duration : null
          );
        },
        label: statusType,
        backgroundColor: Array.from(
          { length: this.stats.length },
          () => this.colorMap[statusType].color
        ),
        borderColor: Array.from(
          { length: this.stats.length },
          () => this.colorMap[statusType].color
        ),
        yAxisID: 'y1',
        order: datasets.length + 3,
        stack: 'builds',
        borderSkipped: true,
        borderWidth: 4,
        minBarLength: 4,
      };
      datasets.push(dataset);
    }

    const builds = [...this.stats];
    const values = datasets[0].data.filter((d) => d > 0);
    const minDuration = (this.minDuration = Math.min(...values));
    const maxDuration = (this.maxDuration = Math.max(...values));
    const averageDuration = (this.averageDuration =
      values.reduce((a, b) => a + b, 0) / values.length);

    this.logger.debug('Builds: ', builds);
    this.logger.debug('Dataset: ', values);
    this.logger.debug('Min duration: ' + minDuration);
    this.logger.debug('Max duration: ' + maxDuration);
    this.logger.debug('Average duration: ' + averageDuration);

    this.basicDatasets = [
      ...datasets,
      {
        data: Array.from(
          { length: datasets[0].data.length },
          () => minDuration
        ),
        label: 'min duration',
        backgroundColor: 'rgba(147,255,51,.1)',
        borderColor: 'rgba(147,255,51,1)',
        borderWidth: 2,
        borderDash: [2, 2],
        // tension: 0.1,
        fill: true,
        hitRadius: 10,
        pointRadius: (ctx: any) => {
          return datasets[0].data[ctx.dataIndex] === minDuration ? 5 : 0;
        },
        yAxisID: 'y1',
        order: 0,
        type: 'line',
        pointStyle: 'star',
        title: 'min duration: ' + formatDuration(minDuration),
      },
      {
        data: Array.from(
          { length: datasets[0].data.length },
          () => maxDuration
        ),
        label: 'max duration',
        backgroundColor: 'rgba(232,62,140,.5)',
        borderColor: 'rgba(232,62,140,1)',
        borderWidth: 2,
        borderDash: [1, 1],
        // tension: 0.4,
        fill: false,
        pointRadius: (ctx: any) => {
          return datasets[0].data[ctx.dataIndex] === maxDuration ? 5 : 0;
        },
        yAxisID: 'y1',
        order: 1,
        type: 'line',
        pointStyle: 'triangle',
      },
      {
        data: Array.from(
          { length: datasets[0].data.length },
          () => averageDuration
        ),
        label: 'avg duration',
        backgroundColor: 'rgba(23,162,184,.1)',
        borderColor: 'rgba(23,162,184,1)',
        borderWidth: 1,
        borderDash: [5, 5],
        // tension: 0.1,
        fill: false,
        pointRadius: (ctx: any) => {
          return datasets[0].data[ctx.dataIndex] === averageDuration ? 5 : 0;
        },
        yAxisID: 'y1',
        order: 2,
        type: 'line',
        pointStyle: 'cross',
      },
    ];

    this.basicData = {
      labels: this.stats.map((s) => s.name),
      datasets: this.basicDatasets,
    };
  }

  public chartClicked(e: any) {
    this.logger.debug('Chart click event', e);
    if (!e || !e.element) return;
    let el: { element: BarElement; datasetIndex: number; index: number } =
      e.element;
    this.logger.debug('Chart element clicked', el);

    let dataset = this.basicDatasets[el.datasetIndex];
    this.logger.debug('Chart dataset clicked', dataset);
    let item = dataset.builds[el.index];
    this.logger.debug('Chart item clicked', item);
    this.selectedObject = item;
    if (!item) return;

    this.selectedItem.emit(this.selectedObject);
  }

  public chartHovered({
    event,
    active,
  }: {
    event: MouseEvent;
    active: {}[];
  }): void {
    this.logger.debug('chartHovered Event', event, active);
  }
}
