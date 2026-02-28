/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"DM Serif Display"', 'serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        canvas: {
          bg: '#F8F6F0',
          line: '#E8E4DC',
        },
        ink: {
          DEFAULT: '#1A1814',
          soft: '#3D3A35',
          muted: '#8C8880',
        },
        chalk: {
          DEFAULT: '#FEFCF8',
          100: '#F8F6F0',
        },
        accent: {
          DEFAULT: '#C8502A',
          hover: '#A8401F',
          light: '#F2E8E4',
        },
        board: '#2C2A27',
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.375rem',
      },
      boxShadow: {
        tool: '0 2px 8px rgba(26,24,20,0.12), 0 1px 3px rgba(26,24,20,0.08)',
        panel: '0 8px 32px rgba(26,24,20,0.12), 0 2px 8px rgba(26,24,20,0.06)',
        float: '0 16px 64px rgba(26,24,20,0.16), 0 4px 16px rgba(26,24,20,0.1)',
      },
    },
  },
  plugins: [],
};
