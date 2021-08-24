import { Model } from './base.models';
import { TestBuild } from './testBuild.models';

export const AggregatedTestStatus = [
  'all_passing',
  'some_passing',
  'all_failing',
  'unknown',
];

export const TestStatus = [
  'passed',
  'failed',
  'error',
  'aborted',
  'running',
  'waiting',
];

export class Status {
  aggregate_test_status: string;
  latestBuilds: [];

  constructor(private data: Object) {
    Object.assign(this, data);
  }
}

export interface StatsItem {
  uuid: string;
  name: string;
  status: any;
  latestBuilds: any;
  class: string;
  statusIcon: string;

  getStatus(): string;
}

export class AggregatedStatusStatsItem extends Model implements StatsItem {
  uuid: string;
  name: string;
  status: any;
  latestBuilds: any;

  private static colorMapping: object = {
    all_passing: 'var(--test-passed)',
    all_failing: 'var(--test-failed)',
    some_passing: 'var(--test-error)',
    unknown: 'var(--test-aborted)',
  };

  constructor(_rawData: Object) {
    super(_rawData);
  }

  getStatus(): string {
    return this.aggregatedStatus;
  }

  public get color(): string {
    return this.aggregatedStatus in AggregatedStatusStatsItem.colorMapping
      ? AggregatedStatusStatsItem.colorMapping[this.aggregatedStatus]
      : 'gray';
  }

  public get class(): string {
    if (this.aggregatedStatus == 'all_passing')
      return 'text-primary align-middle';
    if (this.aggregatedStatus == 'some_passing')
      return 'text-warning align-middle';
    if (this.aggregatedStatus == 'all_failing')
      return 'text-danger align-middle';
    return 'text-gray align-middle';
  }

  public get statusIcon(): string {
    if (!this) return '';
    if (this.aggregatedStatus == 'all_passing') return 'fas fa-check-circle';
    if (this.aggregatedStatus == 'some_passing')
      return 'fas fa-exclamation-circle';
    if (this.aggregatedStatus == 'all_failing') return 'fas fa-minus-circle';
    return 'fas fa-question-circle';
  }

  public get aggregatedStatus(): string {
    return this.status instanceof String || typeof this.status === 'string'
      ? this.status
      : 'aggregated_test_status' in this.status
      ? this.status['aggregated_test_status']
      : 'aggregate_test_status' in this.status
      ? this.status['aggregate_test_status']
      : 'unknonw';
  }
}

export class AbstractStats extends Model {
  private _statuses: Array<string>;

  constructor(statuses: Array<string>, data?: Array<StatsItem>) {
    super();
    this._statuses = statuses;
    console.log('Statuses', statuses);
    this['all'] = [];
    for (let s of statuses) {
      console.log('THIS', this[s]);
      if (!Array.isArray(this[s])) this[s] = [];
      console.log('THIS', s, this[s]);
    }
    if (data) this.update(data);
  }

  public get statuses(): Array<string> {
    return [...this._statuses];
  }

  public add(item: StatsItem) {
    if (item) {
      this.update([item]);
    }
  }

  public update(data: Array<StatsItem>, removeExisting: boolean = false) {
    if (!data) return;
    if (removeExisting) this.clear();

    this['all'].push(...data);
    for (let s of this._statuses) {
      if (s === 'all') continue;
      console.log('Initializing', s);
      this[s].push(...data.filter((item: StatsItem) => item.getStatus() === s));
      console.log('Configured', this[s]);
    }

    // notify updates
    this.notifyChanges();
  }

  public clear(): void {
    for (let k of this._statuses) {
      this[k].length = 0;
    }
  }
}

//export class AggregatedStatusStats extends AbstractStats {
export class AggregatedStatusStats extends AbstractStats {
  all: AggregatedStatusStatsItem[];
  all_passing: AggregatedStatusStatsItem[];
  some_passing: AggregatedStatusStatsItem[];
  all_failing: AggregatedStatusStatsItem[];
  unknown: AggregatedStatusStatsItem[];

  constructor(private items?: AggregatedStatusStatsItem[]) {
    super(AggregatedTestStatus, items);
  }
}

export class StatusStatsItem extends Model implements StatsItem {
  uuid: string;
  name: string;
  status: any;
  latestBuilds: TestBuild[];
  timestamp: number;
  duration: number;

  constructor(_rawData: Object) {
    super(_rawData);
  }

  getStatus(): string {
    return this.status;
  }

  public get color(): string {
    return 'var(--test-' + this.getStatus() + ')';
  }

  public get class(): string {
    if (['all_passing', 'passed'].includes(this.getStatus()))
      return 'text-test-passed align-middle';
    if (['some_passing', 'error'].includes(this.getStatus()))
      return 'text-test-error align-middle';
    if (['all_failing', 'failed'].includes(this.getStatus()))
      return 'text-test-failed align-middle';
    if (['waiting'].includes(this.getStatus()))
      return 'text-test-waiting align-middle';
    if (['aborted'].includes(this.getStatus()))
      return 'text-test-aborted align-middle';
    if (['running'].includes(this.getStatus()))
      return 'text-test-running align-middle';
    return 'text-gray align-middle';
  }

  public get statusIcon(): string {
    if (!this) return '';
    if (['all_passing', 'passed'].includes(this.getStatus()))
      return 'fas fa-check-circle';
    if (['some_passing', 'error'].includes(this.getStatus()))
      return 'fas fa-exclamation-circle';
    if (['all_failing', 'failed'].includes(this.getStatus()))
      return 'fas fa-minus-circle';
    if (['waiting'].includes(this.getStatus())) return 'fas fa-pause-circle';
    if (['aborted'].includes(this.getStatus())) return 'fas fa-ban';
    if (['running'].includes(this.getStatus())) return 'fas fa-sync';
    return 'fas fa-question-circle';
  }
}

export class InstanceStats extends AbstractStats {
  all: StatusStatsItem[];
  passed: StatusStatsItem[];
  failed: StatusStatsItem[];
  error: StatusStatsItem[];
  aborted: StatusStatsItem[];
  running: StatusStatsItem[];
  waiting: StatusStatsItem[];

  constructor(private items?: StatusStatsItem[]) {
    super(TestStatus, items);
  }
}