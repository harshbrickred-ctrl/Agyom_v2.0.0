// BrickRed Group | AGYOM lockup (sidebar + login).
export default function Logo({ size = 40, className = '' }) {
  return (
    <img
      src="/Media.jpg"
      alt="BrickRed Group | AGYOM"
      height={size}
      className={`logo ${className}`}
    />
  );
}
