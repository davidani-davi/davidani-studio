import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f7eee8",
          100: "#efe0d6",
          200: "#dfbfae",
          500: "#B5532A",
          600: "#984321",
          700: "#78341b",
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
        sans: ["var(--font-manrope)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-instrument-serif)", "Georgia", "serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
