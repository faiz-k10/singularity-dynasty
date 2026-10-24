import SiteHeader from "../SiteHeader";

// The page wrapper (.tool-page, an isolated stacking context) and the header + ticker live here, not in each page: a click between
// tools keeps the header on screen while the next page loads, and the full-screen views (z-index above the header) still cover it
// because they share the header's stacking context. Each page mounts InteractiveScript itself: it wires that page's own elements.
export default function ToolsLayout({ children }) {
  return (
    <div className="tool-page">
      <SiteHeader scripts={false} />
      {children}
    </div>
  );
}
