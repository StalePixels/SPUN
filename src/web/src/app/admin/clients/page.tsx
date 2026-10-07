import { adminClientLogKeys, adminClientStats, requireAdmin } from "@/lib/admin";
import { parseStatsMeasure, parseStatsRange, pickStatsKey } from "@/lib/clientstats";
import { Breadcrumbs } from "../../Breadcrumbs";
import { StatsChart } from "./StatsChart";
import { StatsControls } from "./StatsControls";

const MEASURE_LABELS = {
  addresses: "IP addresses",
  connections: "Connections",
};

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const keys = await adminClientLogKeys();
  const key = pickStatsKey(params.key, keys);
  const measure = parseStatsMeasure(params.measure);
  const range = parseStatsRange(params.range);
  const stats = key === null ? null : await adminClientStats(key, measure, range);
  return (
    <>
      <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Client statistics" }]} />
      <h1 className="h3 mb-3">Client statistics</h1>
      <StatsControls keys={keys} statsKey={key} measure={measure} range={range} />
      {!stats || stats.values.length === 0 ? (
        <p className="text-body-secondary" data-testid="stats-empty">
          No client has sent this information in the chosen time range.
        </p>
      ) : (
        <>
          <div className="card mb-4">
            <div className="card-body">
              <h2 className="h6 text-body-secondary">{MEASURE_LABELS[measure]} per day (UTC)</h2>
              <StatsChart values={stats.values} points={stats.points} />
            </div>
          </div>
          <table className="table table-sm" data-testid="stats-table">
            <thead>
              <tr>
                <th scope="col">{key}</th>
                <th scope="col" className="text-end">
                  {MEASURE_LABELS[measure]} per day, summed over {range} days
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.values.map((value, i) => (
                <tr key={value} data-testid="stats-row">
                  <td data-testid="stats-value">{value}</td>
                  <td className="text-end" data-testid={`stats-total-${value}`}>
                    {stats.totals[i]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
