/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#09090B', // Zinc 950
          hover: '#27272A',   // Zinc 800
          light: '#71717A',   // Zinc 500
          50: '#F4F4F5',      // Zinc 100
        },
        accent: {
          DEFAULT: '#18181B', // Zinc 900
          hover: '#3F3F46',   // Zinc 700
        },
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#FAFAFA',   // Zinc 50
          dark: '#000000',    // Pure OLED Black
          'dark-muted': '#09090B', // Zinc 950
        },
        fg: {
          DEFAULT: '#09090B', // Zinc 950
          secondary: '#52525B', // Zinc 600
          muted: '#71717A',   // Zinc 500
          dark: '#FAFAFA',    // Zinc 50
          'dark-secondary': '#A1A1AA', // Zinc 400
        },
        line: {
          DEFAULT: '#E4E4E7', // Zinc 200
          dark: '#27272A',    // Zinc 800
        }
      },
      fontFamily: {
        sans: ['Jost', 'system-ui', 'sans-serif'],
        heading: ['Bodoni Moda', 'Cinzel', 'Georgia', 'serif'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      },
    },
  },
  plugins: [],
}
