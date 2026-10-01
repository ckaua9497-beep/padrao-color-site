export function MockupSkeleton({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  return (
    <div className={`grid size-full place-items-center rounded-card ${dark ? "bg-night text-white/60" : "bg-mist text-muted"} ${className}`}>
      <div className="flex flex-col items-center gap-3" role="status">
        <div className="relative size-14" aria-hidden>
          {["bg-red", "bg-sun", "bg-cyan", "bg-lime"].map((color, i) => (
            <span
              key={color}
              className={`absolute inset-x-1 h-8 rounded-md ${color} motion-safe:animate-pulse`}
              style={{ top: i * 5, transform: `rotate(${-10 + i * 6}deg)`, animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
        <span className="text-xs font-medium">Montando o mockup 3D…</span>
      </div>
    </div>
  );
}
