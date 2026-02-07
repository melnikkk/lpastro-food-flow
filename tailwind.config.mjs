/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      screens: {
        xs: '475px', // Extra small devices (large phones)
        sm: '640px', // Small devices (tablets)
        md: '768px', // Medium devices (small laptops)
        lg: '1024px', // Large devices (desktops)
        xl: '1280px', // Extra large devices (large desktops)
        '2xl': '1536px', // 2X large devices (larger desktops)
        '3xl': '1920px', // 3X large devices (full HD)
        '4xl': '2560px', // 4X large devices (2K/QHD)
      },
      colors: {
        primary: {
          50: '#f7f9f3',
          100: '#eef3e6',
          200: '#dce7cd',
          300: '#c1d6a8',
          400: '#a3c17f',
          500: '#7fa84e',
          600: '#6b923d',
          700: '#547332',
          800: '#455c2b',
          900: '#3a4e26',
          950: '#1d2911',
        },
        secondary: {
          50: '#fefce8',
          100: '#fef9c3',
          200: '#fef08a',
          300: '#fde047',
          400: '#facc15',
          500: '#eab308',
          600: '#ca8a04',
          700: '#a16207',
          800: '#854d0e',
          900: '#713f12',
          950: '#422006',
        },
        accent: {
          orange: '#f97316',
          red: '#ef4444',
          carrot: '#fb923c',
          lime: '#84cc16',
          cream: '#faf8f3',
          beige: '#f5f3ed',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        heading: ['Poppins', 'system-ui', 'sans-serif'],
      },
      spacing: {
        128: '32rem',
        144: '36rem',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      maxWidth: {
        '8xl': '88rem',
        '9xl': '96rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-down': 'slideDown 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
