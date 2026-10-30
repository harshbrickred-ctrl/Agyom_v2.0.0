// BrAg lockup (sidebar + login).
export default function Logo({ size = 40, className = '' }) {
  return (
    <img
      src="/AgBr_Logo.png"
      alt="BrAg"
      height={size}
      className={`logo ${className}`}
    />
  );
}
