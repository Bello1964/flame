import type { ActivityType } from '@flame/shared';

/** Layout and scale helpers for the trend chart (kept apart for fast refresh and tests). */

/**
 * Fixed colour per type (never by rank), from the FLAME chart tokens, in stacking order.
 * Measured: every pair separates (CIELAB ΔE ≥ 22.7, the closest being routine flaring
 * against venting, which differ strongly in lightness) and every mark is ≥ 3:1 on white.
 * Emergency flaring takes Oxide as the most significant flaring; venting, an unburnt
 * release, takes a dark neutral so it never reads as a kind of flaring. Segments are still
 * separated by a gap, and the legend and table view carry the identity too.
 */
export const SERIES: { type: ActivityType; color: string }[] = [
  { type: 'ROUTINE_FLARING', color: 'var(--chart-1)' }, // Patina
  { type: 'NON_ROUTINE_FLARING', color: 'var(--chart-2)' }, // Amber, chart weight
  { type: 'EMERGENCY_FLARING', color: 'var(--chart-3)' }, // Oxide
  { type: 'VENTING', color: 'var(--chart-4)' }, // Basalt neutral
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
/** Top leaves a row above the highest tick for the unit label (tCO₂e). */
export const PAD = { top: 26, right: 8, bottom: 28, left: 56 };

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
