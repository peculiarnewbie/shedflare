import { A } from "@solidjs/router";
import type { AppStatus } from "../api/types";

export default function AppCard(props: { app: AppStatus }) {
  const statusBadge = () => {
    if (!props.app.enabled) return <span class="badge badge-off">Disabled</span>;
    if (props.app.workerDeployed) return <span class="badge badge-ok">Deployed</span>;
    return <span class="badge badge-warn">Not deployed</span>;
  };

  return (
    <div class="app-card">
      <div class="app-card-header">
        <div>
          <div class="app-card-title">{props.app.manifest?.name ?? props.app.id}</div>
          <div class="app-card-id">{props.app.workerName}</div>
        </div>
        {statusBadge()}
      </div>
      <div class="app-card-meta">
        {props.app.url ? (
          <a href={props.app.url} target="_blank" rel="noreferrer">
            {props.app.url}
          </a>
        ) : (
          <span>Not configured in shedflare.config.jsonc</span>
        )}
      </div>
      <div class="app-card-actions">
        <A href={`/apps/${props.app.id}`} class="btn btn-ghost btn-sm">
          Details
        </A>
        <a href={props.app.dashboardUrl} target="_blank" rel="noreferrer" class="btn btn-ghost btn-sm">
          CF Worker
        </a>
        {props.app.url && (
          <a href={props.app.url} target="_blank" rel="noreferrer" class="btn btn-ghost btn-sm">
            Open app
          </a>
        )}
      </div>
    </div>
  );
}
