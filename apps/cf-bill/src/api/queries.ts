export function workersQuery(accountId: string, start: string, end: string): string {
  return JSON.stringify({
    query: `{
      viewer {
        accounts(filter: {accountTag: "${accountId}"}) {
          workersInvocationsAdaptive(
            limit: 1
            filter: {datetime_geq: "${start}", datetime_lt: "${end}"}
            orderBy: [datetime_DESC]
          ) {
            sum {
              requests
              cpuTime
              errors
            }
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
            orderBy: [datetime_DESC]
          ) {
            sum {
              rowsRead
              rowsWritten
              queryCount
            }
            dimensions {
              databaseId
            }
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
            orderBy: [datetime_DESC]
          ) {
            count
            dimensions {
              operationType
            }
          }
        }
      }
    }`,
  });
}

export function kvStorageQuery(accountId: string): string {
  return JSON.stringify({
    query: `{
      viewer {
        accounts(filter: {accountTag: "${accountId}"}) {
          kvStorageAdaptiveGroups(limit: 100, orderBy: [datetime_DESC]) {
            sum {
              keyCount
              storedBytes
            }
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
          durableObjectsInvocationsAdaptive(
            limit: 100
            filter: {datetime_geq: "${start}", datetime_lt: "${end}"}
            orderBy: [datetime_DESC]
          ) {
            sum {
              requests
              cpuTime
            }
            dimensions {
              namespaceId
            }
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
          r2AnalyticsAdaptiveGroups(
            limit: 100
            filter: {datetime_geq: "${start}", datetime_lt: "${end}"}
            orderBy: [datetime_DESC]
          ) {
            sum {
              objectSize
              storageBytes
            }
            dimensions {
              operationType
            }
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
            orderBy: [datetime_DESC]
          ) {
            sum {
              requests
              bytes
            }
          }
        }
      }
    }`,
  });
}
