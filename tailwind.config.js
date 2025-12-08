/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Playfair Display', 'serif'],
      },
      animation: {
        drift: 'drift 7s infinite ease-in-out',
        'drift-reverse': 'drift-reverse 9s infinite ease-in-out',
        gradient: 'gradient-xy 5s ease infinite',
      },
      keyframes: {
        drift: {
          '0%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%': { transform: 'translate(80px, -50px) scale(1.1)' },
          '66%': { transform: 'translate(-40px, 40px) scale(0.95)' },
          '100%': { transform: 'translate(0px, 0px) scale(1)' },
        },
        'drift-reverse': {
          '0%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%': { transform: 'translate(-60px, 60px) scale(0.9)' },
          '66%': { transform: 'translate(50px, -30px) scale(1.05)' },
          '100%': { transform: 'translate(0px, 0px) scale(1)' },
        },
        'gradient-xy': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      },
    },
  },
  plugins: [],
}