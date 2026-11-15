/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#FCE4EC',
          100: '#F8BBD0',
          200: '#F48FB1',
          300: '#F06292',
          400: '#EC407A',
          500: '#E91E63',
          600: '#D81B60',
          700: '#C2185B',
          800: '#AD1457',
          900: '#880E4F',
        },
        accent: {
          DEFAULT: '#FFC107',
          light:   '#FFECB3',
          dark:    '#FFB300',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          muted:   '#F8F9FA',
          hover:   '#F1F3F5',
        },
        indian: {
          orange: '#FF5722',
          green:  '#4CAF50',
        }
      },
      fontFamily: {
        headline: ['"Space Grotesk"', 'sans-serif'],
        body:     ['"Inter"', 'sans-serif'],
        mono:     ['"Space Mono"', 'monospace'],
      },
      boxShadow: {
        'soft-sm':  '2px 2px 0px rgba(0,0,0,0.1)',
        'soft-md':  '4px 4px 0px rgba(0,0,0,0.15)',
        'soft-lg':  '6px 6px 0px rgba(0,0,0,0.2)',
        'soft-xl':  '8px 8px 0px rgba(0,0,0,0.25)',
        'float':    '4px 4px 0px rgba(0,0,0,0.2), 0 0 0 2px rgba(0,0,0,1)',
      },
      borderRadius: {
        DEFAULT: '6px',
        'lg': '8px',
        'xl': '12px',
        '2xl': '16px',
      },
      backgroundImage: {
        'mugulu-dots': 'radial-gradient(circle at center, rgba(255,255,255,0.7) 2.5px, transparent 3px)',
        'mugulu-dots-dark': 'radial-gradient(circle at center, rgba(0,0,0,0.15) 2.5px, transparent 3px)',
        'lotus-pattern': `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' width='60' height='60'%3E%3Cpath d='M50,20 C50,20 60,40 70,50 C60,60 50,80 50,80 C50,80 40,60 30,50 C40,40 50,20 50,20 Z' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='4'/%3E%3Cpath d='M30,50 C30,50 15,45 10,30 C20,35 30,50 30,50 Z' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='3'/%3E%3Cpath d='M70,50 C70,50 85,45 90,30 C80,35 70,50 70,50 Z' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='3'/%3E%3C/svg%3E")`,
      },
    },
  },
  plugins: [],
};
