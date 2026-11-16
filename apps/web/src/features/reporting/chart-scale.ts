import type { ActivityType } from '@flame/shared';

/** Layout and scale helpers for the trend chart (kept apart for fast refresh and tests). */

/**
 * Fixed colour per type (never by rank), from the brand chart tokens, in stacking order.
 * Checked with the palette validator: every adjacent pair separates for normal and
 * colour-deficient vision (worst ΔE 17), and the common routine-flaring + venting pair is
 * Forest against Sage. Sage and Amber are close, so segments are always separated by a
 * gap and the legend and table view carry the identity too.
 */
export const SERIES: { type: ActivityType; color: string }[] = [
  { type: 'ROUTINE_FLARING', color: 'var(--chart-5)' }, // Forest
  { type: 'NON_ROUTINE_FLARING', color: 'var(--chart-4)' }, // Amber Gold
  { type: 'EMERGENCY_FLARING', color: 'var(--chart-1)' }, // Moss
  { type: 'VENTING', color: 'var(--chart-2)' }, // Sage
];

/** Width of the hover/focus readout, to keep it inside the chart. */
export const TOOLTIP_WIDTH = 176;

/** Left edge for the readout of a column: beside it, and never outside the chart. */
export function tooltipLeft(columnLeft: number, slot: number, width: number): number {
  const centre = columnLeft + slot / 2;
  const preferred = centre > width / 2 ? columnLeft - TOOLTIP_WIDTH - 4 : columnLeft + slot + 4;
  return Math.min(Math.max(0, preferred), Math.max(0, width - TOOLTIP_WIDTH));
}

export const HEIGHT = 240;
export const PAD = { top: 12, right: 8, bottom: 28, left: 56 };

/** About four round gridline values from 0 up to at least `max`. */
export function niceTicks(max: number): number[] {
  if (!(max > 0)) return [0];
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let v = 0; v < max + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  if ((ticks[ticks.length - 1] ?? 0) < max)
    ticks.push(Number((ticks.length * step).toPrecision(12)));
  return ticks;
}
