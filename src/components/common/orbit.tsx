// A glossy powder-blue sphere with two tilted orbits and an orange satellite.
// Pure CSS; it stays still when the OS asks for reduced motion.
export function Orbit({ className = "" }: { className?: string }) {
  return (
    <div className={"orbit-scene " + className} aria-hidden="true">
      <div className="orbit-shadow" />
      <div className="orbit-ring" />
      <div className="orbit-ring two" />
      <div className="orbit-core" />
    </div>
  );
}
