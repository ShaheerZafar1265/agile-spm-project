'use client';

import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import type { TooltipOptions } from 'chart.js';
export { CHART_COLORS } from '@/components/analytics/chart-colors';

/**
 * Registers only the Chart.js pieces the analytics dashboard uses (bar + line
 * charts on category/linear scales). Import this module before rendering a chart.
 */
ChartJS.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

if (typeof document !== 'undefined') {
  // next/font gives Inter a generated family name — reuse whatever the body renders with.
  ChartJS.defaults.font.family = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
}
ChartJS.defaults.font.size = 12;
ChartJS.defaults.color = '#78716c'; // stone-500 — axis text stays recessive

// Respect the OS "reduce motion" setting: draw charts in their final state.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    ChartJS.defaults.animation = false;
  }
}

/** Dark, high-contrast tooltip shared by every chart. */
export const TOOLTIP_STYLE: Partial<TooltipOptions<'bar'>> = {
  backgroundColor: '#1c1917',
  titleColor: '#ffffff',
  bodyColor: '#e7e5e4',
  footerColor: '#a8a29e',
  padding: 10,
  cornerRadius: 8,
  boxPadding: 4,
  titleFont: { weight: 'bold' },
  footerFont: { weight: 'normal' },
};
