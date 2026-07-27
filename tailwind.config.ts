import type { Config } from "tailwindcss";

const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: rgb("--bg"),
        ink: rgb("--ink"),
        "ink-soft": rgb("--ink-soft"),
        "ink-faint": rgb("--ink-faint"),
        line: rgb("--line"),
        accent: rgb("--accent"),
        positive: rgb("--positive"),
        negative: rgb("--negative"),
        brand1: rgb("--brand1"),
        brand2: rgb("--brand2"),
        brand3: rgb("--brand3"),
        brand4: rgb("--brand4"),
      },
      fontFamily: {
        display: ["var(--font-display)", "SF Pro Display", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SF Mono", "Menlo", "monospace"],
      },
      borderRadius: {
        "2xl": "1.125rem",
        "3xl": "1.5rem",
      },
      transitionTimingFunction: {
        "spring-out": "cubic-bezier(0.22, 1, 0.36, 1)",
        back: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
