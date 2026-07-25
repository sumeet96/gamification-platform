import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: "#0F1017",
        surface: "#171A24",
        ink: "#ECEDF4",
        "ink-soft": "#A5AABF",
        line: "#272B3A",
        accent: "#F0AA3C",
      },
      fontFamily: {
        display: ["Georgia", "Times New Roman", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
