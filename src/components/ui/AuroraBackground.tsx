/** Decorative, slowly drifting colour fields behind every screen. */
export function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute -left-1/4 -top-1/4 h-[70vmax] w-[70vmax] animate-drift rounded-full bg-cyan/20 blur-[120px]" />
      <div
        className="absolute -bottom-1/3 -right-1/4 h-[75vmax] w-[75vmax] animate-drift rounded-full bg-violet/25 blur-[140px]"
        style={{ animationDelay: "-9s" }}
      />
      <div className="absolute left-1/3 top-1/2 h-[35vmax] w-[35vmax] animate-drift rounded-full bg-rose/10 blur-[120px]" />
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(255 255 255) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
    </div>
  );
}
