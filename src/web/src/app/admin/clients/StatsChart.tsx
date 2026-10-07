"use client";

import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import type { StatsPoint } from "@/lib/clientstats";

const COLOURS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

export function StatsChart({ values, points }: { values: string[]; points: StatsPoint[] }) {
  return (
    <LineChart responsive data={points} style={{ width: "100%", aspectRatio: 2.5 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="day" minTickGap={24} tick={{ fontSize: 12 }} />
      <YAxis allowDecimals={false} width="auto" tick={{ fontSize: 12 }} />
      <Tooltip />
      <Legend />
      {values.map((value, i) => (
        <Line
          key={value}
          name={value}
          dataKey={(point: StatsPoint) => point.counts[i]}
          stroke={COLOURS[i % COLOURS.length]}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      ))}
    </LineChart>
  );
}
