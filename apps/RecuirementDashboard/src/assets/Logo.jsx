import { useTheme } from '../context/ThemeContext';

// Reusable Agyom logo (sidebar + login).
// Dark theme uses the light-on-dark wordmark.
export default function Logo({ size = 40, className = '' }) {
  const { theme } = useTheme();
  const src = theme === 'dark' ? '/agyom_dark.png' : '/agyom_light.png';

  return (
    <img
      src={src}
      alt="Agyom"
      height={size}
      className={`logo ${className}`}
    />
  );
}
