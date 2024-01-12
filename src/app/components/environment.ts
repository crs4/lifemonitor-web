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

// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  // 'apiBaseUrl': base URL of the LifeMonitor API instance
  //               (e.g., https://api.lifemonitor.eu)
  apiBaseUrl: '<LIFEMONITOR_API_BASE_URL>',
  // 'socketBaseUrl': base URL of the LifeMonitor Socket endpoint
  //               (e.g., https://api.lifemonitor.eu)
  socketBaseUrl: 'LIFEMONITOR_SOCKET_BASE_URL>',
  // 'clientId': OAuth2 ClientID that can be obtained by registering
  //             an OAuth2 app with <LIFEMONITOR_API_BASE_URL>/profile -> OAuth Apps
  clientId: '<LIFEMONITOR_OAUTH2_CLIENT_ID>',
  // 'configFile': the path of a JSON resource containing
  //               the configuration properties that should be loaded
  //               and set without rebuild (e.g., apiBaseUrl, clientId).
  //               They overwrite the default environment settings defined at build-time
  //               and are exposed by the `AppConfigService.getConfig()` method.
  configFile: "/assets/config.json",
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
