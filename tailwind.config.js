/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Centralized CareLoop Design Tokens
        brand: {
          DEFAULT: "#B42332", // Primary CareLoop identity
          dark: "#8F1928",    // Strong brand emphasis
          light: "#FDF2F3",   // Subtle tinted background
          hover: "#9E1E2B",
        },
        emergency: {
          DEFAULT: "#C62828", // Emergency alerts only
          dark: "#A31F1F",
          light: "#FDECEC",
          border: "#F5C2C2",
        },
        success: {
          DEFAULT: "#16845B", // Verified success
          dark: "#106445",
          light: "#EDF7F3",
          border: "#BCE3D4",
        },
        warning: {
          DEFAULT: "#C58A24", // Pending attention
          dark: "#9A6B1A",
          light: "#FEF8EE",
          border: "#F7DEAF",
        },
        info: {
          DEFAULT: "#3478B8", // Informational states
          dark: "#255A8C",
          light: "#F0F6FB",
          border: "#BFD7ED",
        },
        // Semantic Application Neutrals
        app: {
          text: "#202322",          // color-text-primary
          'text-secondary': "#69716F", // color-text-secondary
          bg: "#F8F9F8",            // color-background
          surface: "#FFFFFF",       // color-surface
          border: "#E6E9E7",        // color-border
          muted: "#F0F2F0",         // color-muted
        },
        // Backward compatibility mappings for existing components
        background: "#F8F9F8",
        foreground: "#202322",
        primary: {
          DEFAULT: "#B42332",
          hover: "#8F1928",
          light: "#FDF2F3",
        },
        slate: {
          50: "#F8F9F8",
          100: "#F0F2F0",
          200: "#E6E9E7",
          300: "#D3D7D5",
          400: "#9BA3A1",
          500: "#69716F",
          600: "#4D5452",
          700: "#363C3A",
          800: "#282C2B",
          900: "#202322",
          950: "#141716",
        },
        medical: {
          red: "#C62828",
          green: "#16845B",
          amber: "#C58A24",
          blue: "#3478B8",
        }
      },
      fontFamily: {
        sans: ['Inter', 'Plus Jakarta Sans', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        'display': ['3.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '800' }], // 56px
        'h1': ['2.75rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],     // 44px
        'h2': ['2.125rem', { lineHeight: '1.25', letterSpacing: '-0.015em', fontWeight: '700' }], // 34px
        'h3': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],      // 24px
        'h4': ['1.1875rem', { lineHeight: '1.4', letterSpacing: '-0.005em', fontWeight: '600' }],  // 19px
        'body': ['0.9375rem', { lineHeight: '1.5', fontWeight: '400' }],                          // 15px
        'secondary': ['0.84375rem', { lineHeight: '1.45', fontWeight: '400' }],                   // 13.5px
        'caption': ['0.75rem', { lineHeight: '1.4', fontWeight: '500' }],                         // 12px
      },
      borderRadius: {
        'xs': '4px',
        'sm': '4px',
        'DEFAULT': '8px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '16px',
        '3xl': '16px', // Restrained healthcare radius, not cartoonish
        'pill': '999px',
        'full': '9999px',
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(32, 35, 34, 0.04), 0 1px 3px 0 rgba(32, 35, 34, 0.02)',
        'card': '0 2px 4px -1px rgba(32, 35, 34, 0.04), 0 1px 2px -1px rgba(32, 35, 34, 0.02)',
        'elevated': '0 8px 16px -4px rgba(32, 35, 34, 0.06), 0 4px 6px -2px rgba(32, 35, 34, 0.03)',
      },
      transitionDuration: {
        'micro': '150ms',
        'component': '240ms',
        'page': '350ms',
      }
    },
  },
  plugins: [],
}
