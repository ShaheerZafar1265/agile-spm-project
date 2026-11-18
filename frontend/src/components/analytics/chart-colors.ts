/** Shared by chart clients and server-rendered workforce components. */
export const CHART_COLORS = {
  revenue: '#d06f2b', // brand-500
  revenueHover: '#b85620', // brand-600
  count: '#3f6ea6',
  countHover: '#335a88',
  muted: '#bccadb',
  mutedHover: '#a5b6cb',
  grid: '#f0eeec',
  axis: '#e7e5e4',
  surface: '#ffffff',
  axisTitle: '#78716c', // stone-500 — axis titles
  label: '#44403c', // stone-700 — category labels and legend text
  warning: '#d97706', // amber-600 — below-target state
  danger: '#b91c1c', // red-700 — a state that needs attention (late, over budget)
  track: '#e7e5e4', // stone-200 — empty track behind rings and meters
  breakTime: '#d6d3d1', // stone-300 — time off the clock
} as const;
