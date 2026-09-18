import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fdf6ec",
          100: "#f9e7cc",
          200: "#f2cc95",
          300: "#e8ab5c",
          400: "#dd8b33",
          500: "#cf6d1e",
          600: "#b2541a",
          700: "#8d3f1a",
          800: "#71341b",
          900: "#5c2c19",
        },
        olive: {
          100: "#f3f4d8",
          200: "#e6e9ab",
          300: "#d4da72",
          400: "#c1c944",
          500: "#a8b400",
          600: "#8a9500",
          700: "#6b7300",
          800: "#525803",
          900: "#3f4405",
        },
        ink: {
          700: "#2b2a24",
          800: "#1f1e19",
          900: "#151410",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,15,12,0.04), 0 8px 24px -12px rgba(16,15,12,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
