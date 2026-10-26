// Chart colours (validated for colour-vision deficiency and contrast on the light surface)
export const C = {
  // categorical slots 1 and 2
  series1: "#2a78d6",
  series2: "#eb6834",
  // aging: neutral for "not yet due", then one ordinal orange ramp, light to dark, by lateness
  current: "#a1a1aa",
  overdue: ["#f08a5a", "#d9541f", "#a83d12", "#6e260a"],
  grid: "#e4e4e7",
  axis: "#71717a"
};

export const BUCKET_COLORS = [C.current, ...C.overdue];
