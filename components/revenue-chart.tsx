'use client';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { money, revenueSeries } from '@/lib/demo-data';
export function RevenueChart({ period }: { period: '30' | '7' }) {
  const data = period === '7' ? revenueSeries.slice(-3) : revenueSeries;
  return (
    <figure
      className="chart-wrap"
      aria-label={
        'Sample revenue compared with the previous ' +
        period +
        ' days. Values range from £2,140 to £5,980.'
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9681e3" stopOpacity={0.17} />
              <stop offset="100%" stopColor="#9681e3" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="#f0ecf5"
            strokeDasharray="4 4"
            vertical={false}
          />
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: '#716c7f' }}
            minTickGap={26}
            tickMargin={14}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: '#716c7f' }}
            tickFormatter={(value: number) => '£' + value / 1000 + 'k'}
            width={55}
            domain={[0, 8000]}
            ticks={[0, 2000, 4000, 6000, 8000]}
          />
          <Tooltip
            cursor={{ stroke: '#cfc2e2', strokeDasharray: '4 4' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="chart-tooltip">
                  {label}
                  <strong>
                    {money(
                      Number(
                        payload.find((item) => item.dataKey === 'revenue')
                          ?.value || 0,
                      ),
                    )}
                  </strong>
                  <span>Sample revenue</span>
                </div>
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#9681dc"
            strokeWidth={2.4}
            fill="url(#revenue-fill)"
            activeDot={{
              r: 5,
              fill: '#9681dc',
              stroke: '#fff',
              strokeWidth: 3,
            }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="previous"
            stroke="#d6cce7"
            strokeWidth={1.6}
            strokeDasharray="5 5"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  );
}
