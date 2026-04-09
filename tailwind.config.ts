import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#08090e',
        sky: '#38bdf8',
        slate: '#64748b',
        violet: '#a78bfa',
        emerald: '#34d399',
        amber: '#fbbf24',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Helvetica', 'Arial'],
      },
    },
  },
  plugins: [],
};
export default config;
