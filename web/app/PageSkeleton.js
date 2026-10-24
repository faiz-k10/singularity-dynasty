// What a tool page shows the instant a nav click lands, until the page's own data has streamed in (loading.js in app/tools and app/my-team).
export default function PageSkeleton() {
  return (
    <main className="wrap tool-wrap" aria-busy="true" aria-label="Loading">
      <div className="page-skel page-skel-title" />
      <div className="page-skel page-skel-bar" />
      <div className="page-skel-rows">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="page-skel page-skel-row" />
        ))}
      </div>
    </main>
  );
}
