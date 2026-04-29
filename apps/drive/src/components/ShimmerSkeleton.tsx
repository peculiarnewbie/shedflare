export default function ShimmerSkeleton() {
  return (
    <div class="shimmer-grid">
      {Array.from({ length: 6 }).map(() => (
        <div class="shimmer-card">
          <div class="shimmer-preview shimmer-pulse" />
          <div class="shimmer-line shimmer-pulse" style={{ width: "70%" }} />
          <div class="shimmer-line shimmer-pulse" style={{ width: "45%" }} />
          <div class="shimmer-line shimmer-pulse" style={{ width: "55%" }} />
        </div>
      ))}
    </div>
  );
}
