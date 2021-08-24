import {
  Component,
  Input,
  OnInit,
  OnChanges,
  SimpleChanges,
  ChangeDetectorRef,
} from '@angular/core';
import { ChartDataSets, ChartOptions, ChartType } from 'chart.js';
import { Color, Label, SingleDataSet } from 'ng2-charts';
import {
  AbstractStats,
  AggregatedStatusStats,
  InstanceStats,
} from 'src/app/models/stats.model';

@Component({
  selector: 'stats-pie-chart',
  templateUrl: './stats-pie-chart.component.html',
  styleUrls: ['./stats-pie-chart.component.scss'],
})
export class StatsPieChartComponent implements OnInit, OnChanges {
  @Input() stats!: AbstractStats;

  public pieChartOptions: ChartOptions = {
    responsive: true,
    cutoutPercentage: 20,
    // circumference: 10,
  };
  public pieChartLabels: Label[] = [];

  public pieChartData: ChartDataSets[];
  public pieChartType: ChartType = 'pie';
  public pieChartLegend = false;
  public pieChartPlugins = [];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {}

  ngOnChanges(changes: SimpleChanges): void {
    this.update();
  }

  ngAfterViewInit() {
    console.log("after view init " + this.stats);
}

  public update(){
    if (this.stats) {
      this.pieChartLabels = this.getLabels();
      this.pieChartData = [
        {
          data: this.data,
          backgroundColor: this.getColors(),
        },
      ];
      // this.cdr.detectChanges();
      console.log("workflow pie data", this.pieChartData, this.pieChartLabels, this.stats );
    }
  }

  public getColors() {
    return this.stats instanceof AggregatedStatusStats
      ? ['#1f8787', '#f9b233', '#dc3545', 'grey']
      : this.stats instanceof InstanceStats
      ? ['#1f8787', '#dc3545', '#ffc107', '#6c757d', '#17a2b8', '#fd7e14']
      : ['#D5D8DC'];
  }

  public getLabels() {
    return this.stats instanceof AggregatedStatusStats
      ? [['Passing'], ['Some passing'], ['Failing'], ['Unavailable']]
      : this.stats instanceof InstanceStats
      ? [['Passed'], ['Failed'], ['Error'], ['Aborted'], ['Running'], ['Waiting']]
      : [['Unknown']];
  }

  public get data(): Array<number> {
    let data: Array<number> = [];
    if (this.stats) {
      for (let p of this.stats.statuses) {
        let v: number = this.stats[p].length;
        data.push(v);
      }
    } else {
      data.push(1);
    }
    console.log('Data', data);
    return data;
  }
}