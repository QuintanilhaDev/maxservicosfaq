export function LoadingSpinner({
  size = 20,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-block rounded-full border-2 border-jade-200/30 border-t-jade-400 animate-spin-slow ${className}`}
      style={{ width: size, height: size }}
      aria-label="Carregando"
      role="status"
    />
  );
}

export function LoadingOverlay({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-max-black/80 backdrop-blur-sm animate-fade-up">
      <LoadingSpinner size={40} />
      <p className="text-jade-200 text-sm tracking-wide animate-pulse-soft">{label}</p>
    </div>
  );
}

export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-3 rounded-full bg-jade-900/40 animate-pulse-soft ${className}`}
    />
  );
}
