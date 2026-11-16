import { useEffect, useRef, useState } from 'react';
import type { EmissionsTrendDto, TrendMonthDto } from '@flame/shared';
import { Button } from '@/components/ui/button';
import { formatDecimal } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ACTIVITY_TYPE_LABELS } from '@/features/activity/labels';
import { HEIGHT, PAD, SERIES, niceTicks } from './chart-scale';

/**
 * Twelve months of approved tCO₂e, stacked by activity type (hand-built SVG; no chart
 * library). Geometry uses Number() for drawing only; every value shown as text comes from
 * the API's exact decimal strings. A legend and a table view carry the same data, so
 * nothing depends on colour or hover alone.
 */

function shortMonth(key: string): string {
  const month = Number(key.slice(5, 7));
  const name = new Date(Date.UTC(2000, month - 1, 1)).toLocaleString('en-GB', {
    month: 'short',
    timeZone: 'UTC',
  });
  return month === 1 ? `${name} ${key.slice(2, 4)}` : name;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.floor(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);
  return { ref, width };
}

function Tooltip({ month }: { month: TrendMonthDto }) {
  return (
    <div className="pointer-events-none rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">{month.label}</p>
      {month.total === null ? (
        <p className="text-muted-foreground">No approved calculations</p>
      ) : (
        <>
          <ul className="mt-1 space-y-0.5">
            {SERIES.filter((s) => month.byType[s.type] !== null).map((s) => (
              <li key={s.type} className="flex items-center gap-2">
                <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
                <span>{ACTIVITY_TYPE_LABELS[s.type]}</span>
                <span className="ml-auto pl-3 tabular-nums">
                  {formatDecimal(month.byType[s.type] ?? '0', 3)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 flex justify-between gap-3 border-t pt-1 font-medium tabular-nums">
            <span>Total</span>
            <span>{formatDecimal(month.total, 3)} tCO₂e</span>
          </p>
          {month.includesEstimated && (
            <p className="mt-0.5 text-muted-foreground">Includes estimated figures</p>
          )}
        </>
      )}
    </div>
  );
}

export function TrendChart({ trend }: { trend: EmissionsTrendDto }) {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const months = trend.months;
  const present = SERIES.filter((s) => months.some((m) => m.byType[s.type] !== null));
  const max = Math.max(0, ...months.map((m) => Number(m.total ?? 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] ?? 1;
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / months.length;
  const barW = Math.max(6, Math.min(36, slot * 0.6));
  const y = (v: number) => PAD.top + plotH - (top > 0 ? (v / top) * plotH : 0);
  const hovered = hover === null ? undefined : months[hover];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {present.length > 0 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
            {present.map((s) => (
              <li key={s.type} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
                {ACTIVITY_TYPE_LABELS[s.type]}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={asTable}
          onClick={() => {
            setAsTable((v) => !v);
          }}
          className="print:hidden"
        >
          {asTable ? 'Show chart' : 'Show as table'}
        </Button>
      </div>

      {asTable ? (
        <TrendTable trend={trend} />
      ) : (
        <div ref={ref} className="relative">
          <svg
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${String(width)} ${String(HEIGHT)}`}
            role="img"
            aria-label={`Approved emissions in tCO₂e per month, ${months[0]?.label ?? ''} to ${months[months.length - 1]?.label ?? ''}. Use “Show as table” for the values.`}
            className="block max-w-full"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--border)"
                  strokeWidth={1}
                  strokeDasharray={t === 0 ? undefined : '2 3'}
                />
                <text
                  x={PAD.left - 6}
                  y={y(t)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-muted-foreground text-[10px] tabular-nums"
                >
                  {formatDecimal(String(t), 3)}
                </text>
              </g>
            ))}
            <text
              x={4}
              y={PAD.top - 2}
              className="fill-muted-foreground text-[10px]"
              dominantBaseline="hanging"
            >
              tCO₂e
            </text>
            {months.map((m, i) => {
              const cx = PAD.left + slot * i + slot / 2;
              let acc = 0;
              return (
                <g key={m.key}>
                  {SERIES.map((s) => {
                    const v = Number(m.byType[s.type] ?? 0);
                    if (!(v > 0)) return null;
                    const y0 = y(acc);
                    acc += v;
                    const y1 = y(acc);
                    const h = y0 - y1;
                    // A 2px gap between stacked segments, unless the segment is tiny.
                    const gap = h > 4 ? 2 : 0;
                    return (
                      <rect
                        key={s.type}
                        x={cx - barW / 2}
                        y={y1 + gap}
                        width={barW}
                        height={Math.max(1, h - gap)}
                        rx={2}
                        fill={s.color}
                        opacity={hover === null || hover === i ? 1 : 0.55}
                      />
                    );
                  })}
                  <text
                    x={cx}
                    y={HEIGHT - PAD.bottom + 16}
                    textAnchor="middle"
                    className={cn(
                      'fill-muted-foreground text-[10px]',
                      width < 520 && i % 2 === 1 && 'hidden',
                    )}
                  >
                    {shortMonth(m.key)}
                  </text>
                  {/* Hit target: the whole month column. */}
                  <rect
                    x={PAD.left + slot * i}
                    y={PAD.top}
                    width={slot}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => {
                      setHover(i);
                    }}
                    onMouseLeave={() => {
                      setHover(null);
                    }}
                  />
                </g>
              );
            })}
          </svg>
          {hovered && hover !== null && (
            <div
              className="absolute top-2 z-10"
              style={
                PAD.left + slot * hover + slot / 2 > width / 2
                  ? { right: width - (PAD.left + slot * hover) + 4 }
                  : { left: PAD.left + slot * (hover + 1) + 4 }
              }
            >
              <Tooltip month={hovered} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TrendTable({ trend }: { trend: EmissionsTrendDto }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Approved emissions per month (tCO₂e)</caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">
              Month
            </th>
            {SERIES.map((s) => (
              <th key={s.type} scope="col" className="px-3 py-2 text-right font-medium">
                {ACTIVITY_TYPE_LABELS[s.type]}
              </th>
            ))}
            <th scope="col" className="py-2 pl-3 text-right font-medium">
              Total (tCO₂e)
            </th>
          </tr>
        </thead>
        <tbody>
          {trend.months.map((m) => (
            <tr key={m.key} className="border-b last:border-0">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                {m.label}
                {m.includesEstimated && (
                  <span className="ml-1 text-xs text-muted-foreground">(includes estimated)</span>
                )}
              </th>
              {SERIES.map((s) => (
                <td key={s.type} className="px-3 py-1.5 text-right tabular-nums">
                  {m.byType[s.type] === null ? '—' : formatDecimal(m.byType[s.type] ?? '0', 3)}
                </td>
              ))}
              <td className="py-1.5 pl-3 text-right font-medium tabular-nums">
                {m.total === null ? '—' : formatDecimal(m.total, 3)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
