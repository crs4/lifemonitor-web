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

import { Model } from './base.models';
import { Suite } from './suite.models';

export class UserNotification extends Model {
  id: string;
  data: object;
  created: number;
  read: number;
  uuid: string;
  title: string;
  body: string;
  icon: string;
  color: string;
  lang: string;
  tag: string;
  event: string;

  constructor(rawData?: Object, skip?: []) {
    super(rawData, skip);
  }

  public update(rawData?: Object) {
    if (!rawData) return;
    super.update(rawData);
    if (this.event === 'INFO') {
      this.icon = 'fas fa-info-circle';
      this.color = 'var(--eosc-green)';
    } else if (this.event === 'UNCONFIGURED_EMAIL') {
      this.icon = 'fas fa-exclamation-triangle';
      this.color = 'var(--eosc-yellow)';
    } else if (this.event === 'BUILD_FAILED') {
      this.icon = 'fas fa-minus-circle';
      this.color = 'var(--test-failed)';
    } else if (this.event === 'BUILD_RECOVERED') {
      this.icon = 'fas fa-check-circle';
      this.color = 'var(--test-failed)';
    } else if (this.event === 'WARNING') {
      this.icon = 'fas fa-exclamation-triangle';
      this.color = 'var(--eosc-yellow)';
    } else if (this.event === 'ERROR') {
      this.icon = 'fas fa-question-circle';
      this.color = 'var(--danger)';
    } else if (
      ['GITHUB_WORKFLOW_VERSION', 'GITHUB_WORKFLOW_ISSUE'].includes(this.event)
    ) {
      this.icon = 'fab fa-github fa-sm';
      this.color = 'var(--dark)';
    } else {
      this.icon = 'fas fa-question-circle';
      this.color = 'var(--eosc-green)';
    }
  }

  public asUrlParam(): string {
    if (this.event === 'BUILD_FAILED' || this.event === 'BUILD_RECOVERED') {
      return Suite.getUrlParam(
        this.data['build']['workflow']['uuid'],
        this.data['build']['workflow']['version'],
        this.data['build']['suite']['uuid']
      );
    }
    return null;
  }
}
