import { Navigate, useParams } from "@solidjs/router";

export default function ScheduleDetailRedirect() {
  const params = useParams<{ id: string }>();
  return <Navigate href={`/schedules?focus=${encodeURIComponent(params.id)}`} />;
}
