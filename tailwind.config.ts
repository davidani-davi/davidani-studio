import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: { DEFAULT: "3px", sm: "3px", md: "3px", lg: "3px", xl: "3px", "2xl": "3px", "3xl": "3px" },
      fontWeight: { semibold: "500", bold: "500", extrabold: "500", black: "500" },
      colors: {
        brand: {
          50: "#F4F3EF",
          100: "#eeede8",
          200: "#e6e5e0",
          500: "#1c1c1a",
          600: "#333330",
          700: "#1c1c1a",
        },
        /*
         * beUI's semantic names, pointed at this studio's palette.
         *
         * The vendored components in components/motion are written against
         * shadcn's vocabulary — bg-card, text-muted-foreground, bg-primary/10.
         * Rather than rewrite them (which would fork them from upstream and
         * make every future beUI component a translation job), the vocabulary
         * is defined here in Davi & Dani's own colours. A beUI drawer then
         * arrives already looking like the app.
         *
         * Channel triples, not hex, so Tailwind's slash-opacity syntax works:
         * `bg-primary/10` needs to write rgb(R G B / 0.1).
         */
        border: "rgb(var(--ui-border) / <alpha-value>)",
        background: "rgb(var(--ui-background) / <alpha-value>)",
        foreground: "rgb(var(--ui-foreground) / <alpha-value>)",
        card: "rgb(var(--ui-card) / <alpha-value>)",
        muted: "rgb(var(--ui-muted) / <alpha-value>)",
        "muted-foreground": "rgb(var(--ui-muted-foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--ui-primary) / <alpha-value>)",
          foreground: "rgb(var(--ui-primary-foreground) / <alpha-value>)",
        },
        destructive: "rgb(var(--ui-destructive) / <alpha-value>)",
        ring: "rgb(var(--ui-ring) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-inter)", "Georgia", "serif"],
        mono: ["var(--font-inter)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
