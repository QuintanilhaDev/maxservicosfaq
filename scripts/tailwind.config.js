/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "max-black": {
          DEFAULT: "#080a09",
          soft: "#0f1512",
          card: "#121815",
        },
        jade: {
          50: "#e6fbf3",
          100: "#c0f5e0",
          200: "#8fedc9",
          300: "#57e0ac",
          400: "#2ccf92",
          500: "#00a86b",
          600: "#00875a",
          700: "#026b49",
          800: "#075139",
          900: "#0a3c2b",
          glow: "#34d399"
        }
      },
      backgroundImage: {
        "jade-radial": "radial-gradient(circle at 50% 0%, rgba(0,168,107,0.18), transparent 60%)",
      },
      boxShadow: {
        "jade-glow": "0 0 0 3px rgba(52,211,153,0.35), 0 0 20px rgba(0,168,107,0.35)",
        "card": "0 10px 40px -12px rgba(0,0,0,0.6)"
      },
      keyframes: {
        "flash-border": {
          "0%": { boxShadow: "0 0 0 0 rgba(52,211,153,0.7)" },
          "50%": { boxShadow: "0 0 0 6px rgba(52,211,153,0.25)" },
          "100%": { boxShadow: "0 0 0 0 rgba(52,211,153,0)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%,100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        }
      },
      animation: {
        "flash-border": "flash-border 0.6s ease-out",
        "fade-up": "fade-up 0.6s cubic-bezier(0.16,1,0.3,1) both",
        "pulse-soft": "pulse-soft 1.6s ease-in-out infinite",
        "spin-slow": "spin-slow 1.2s linear infinite",
      }
    },
  },
  plugins: [],
};
