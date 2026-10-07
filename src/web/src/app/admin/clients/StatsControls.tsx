"use client";

import { usePathname, useRouter } from "next/navigation";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import Row from "react-bootstrap/Row";
import ToggleButton from "react-bootstrap/ToggleButton";
import ToggleButtonGroup from "react-bootstrap/ToggleButtonGroup";
import { STATS_RANGES, type StatsMeasure, type StatsRange } from "@/lib/clientstats";

type View = { key: string | null; measure: StatsMeasure; range: StatsRange };

export function StatsControls({
  keys,
  statsKey,
  measure,
  range,
}: {
  keys: string[];
  statsKey: string | null;
  measure: StatsMeasure;
  range: StatsRange;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const show = (change: Partial<View>) => {
    const view = { key: statsKey, measure, range, ...change };
    const params = new URLSearchParams({ measure: view.measure, range: String(view.range) });
    if (view.key !== null) {
      params.set("key", view.key);
    }
    router.push(`${pathname}?${params}`, { scroll: false });
  };
  return (
    <Row className="g-3 align-items-end mb-4">
      <Col xs="auto">
        <Form.Label htmlFor="stats-key">Key</Form.Label>
        <Form.Select
          id="stats-key"
          data-testid="stats-key"
          value={statsKey ?? ""}
          disabled={keys.length === 0}
          onChange={(event) => show({ key: event.target.value })}
        >
          {keys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </Form.Select>
      </Col>
      <Col xs="auto">
        <ToggleButtonGroup type="radio" name="stats-measure" value={measure} onChange={(value) => show({ measure: value })}>
          <ToggleButton id="stats-measure-addresses" value="addresses" variant="outline-primary" data-testid="stats-measure-addresses">
            IP addresses per day
          </ToggleButton>
          <ToggleButton id="stats-measure-connections" value="connections" variant="outline-primary" data-testid="stats-measure-connections">
            Connections per day
          </ToggleButton>
        </ToggleButtonGroup>
      </Col>
      <Col xs="auto">
        <ToggleButtonGroup type="radio" name="stats-range" value={range} onChange={(value) => show({ range: value })}>
          {STATS_RANGES.map((days) => (
            <ToggleButton
              key={days}
              id={`stats-range-${days}`}
              value={days}
              variant="outline-primary"
              data-testid={`stats-range-${days}`}
            >
              {days} days
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Col>
    </Row>
  );
}
