export function workersQuery(accountId: string, start: string, end: string): string {
  return JSON.stringify({
    query: `{
      viewer {
        accounts(filter: {accountTag: "${accountId}"}) {
          workersInvocationsAdaptive(
            limit: 1
            filter: {datetime_geq: "${start}", datetime_lt: "${end}"}
          ) {
            sum { requests errors }
          }
        }
      }
    }`,
  });
}

export function workersByScriptQuery(accountId: string, start: string, end: string): string {
  return JSON.stringify({
    query: `{
      viewer {
        accounts(filter: {accountTag: "${accountId}"}) {
          workersInvocationsAdaptive(
            limit: 100
            filter: {datetime_geq: "${start}", datetime_lt: "${end}"}
          ) {
            sum { requests errors }
            dimensions { scriptName }
          }
        }
      }
    }`,
  });
}

export function d1Query(accountId: string, start: string, end: string): string {
  return JSON.stringify({
    query: `{
      viewer {
        accounts(filter: {accountTag: "${accountId}"}) {
          d1AnalyticsAdaptiveGroups(
            limit: 100
            filter: {datetime_geq: "${start}", datetime_lt: "${end}"}
          ) {
            sum { rowsRead rowsWritten }
            dimensions { databaseId }
          }
        }
      }
    }`,
  });
}

export function kvOpsQuery(accountId: string, start: string, end: string): string {
  return JSON.stringify({
    query: `{
      viewer {
        accounts(filter: {accountTag: "${accountId}"}) {
          kvOperationsAdaptiveGroups(
            limit: 100
            filter: {datetime_geq: "${start}", datetime_lt: "${end}"}
          ) {
            count
            dimensions { actionType }
          }
        }
      }
    }`,
  });
}

export function kvStorageQuery(accountId: string, start: string, end: string): string {
  return JSON.stringify({
    query: `{
      viewer {
        accounts(filter: {accountTag: "${accountId}"}) {
          kvStorageAdaptiveGroups(
            limit: 100
            filter: {datetime_geq: "${start}", datetime_lt: "${end}"}
          ) {
            max { keyCount byteCount }
          }
        }
      }
    }`,
  });
}

export function doQuery(accountId: string, start: string, end: string): string {
  return JSON.stringify({
    query: `{
      viewer {
        accounts(filter: {accountTag: "${accountId}"}) {
          durableObjectsInvocationsAdaptiveGroups(
            limit: 100
            filter: {datetime_geq: "${start}", datetime_lt: "${end}"}
          ) {
            sum { requests errors }
            dimensions { namespaceId }
          }
        }
      }
    }`,
  });
}

export function doStorageQuery(accountId: string, start: string, end: string): string {
  return JSON.stringify({
    query: `{
      viewer {
        accounts(filter: {accountTag: "${accountId}"}) {
          durableObjectsStorageGroups(
            limit: 100
            filter: {datetime_geq: "${start}", datetime_lt: "${end}"}
          ) {
            max { storedBytes }
          }
        }
      }
    }`,
  });
}

export function r2Query(accountId: string, start: string, end: string): string {
  return JSON.stringify({
    query: `{
      viewer {
        accounts(filter: {accountTag: "${accountId}"}) {
          r2OperationsAdaptiveGroups(
            limit: 100
            filter: {datetime_geq: "${start}", datetime_lt: "${end}"}
          ) {
            sum { requests errors }
            dimensions { actionType }
          }
        }
      }
    }`,
  });
}

export function r2StorageQuery(accountId: string, start: string, end: string): string {
  return JSON.stringify({
    query: `{
      viewer {
        accounts(filter: {accountTag: "${accountId}"}) {
          r2StorageAdaptiveGroups(
            limit: 100
            filter: {datetime_geq: "${start}", datetime_lt: "${end}"}
          ) {
            max { objectCount payloadSize }
          }
        }
      }
    }`,
  });
}

export function httpQuery(zoneId: string, start: string, end: string): string {
  return JSON.stringify({
    query: `{
      viewer {
        zones(filter: {zoneTag: "${zoneId}"}) {
          httpRequests1mGroups(
            limit: 1
            filter: {datetime_geq: "${start}", datetime_lt: "${end}"}
          ) {
            sum { requests errors bytes }
          }
        }
      }
    }`,
  });
}
