import SiteHeader from "../SiteHeader";

// The header + ticker live here, not in each page, so a click between tools keeps them on screen while the next page loads
// (each page mounts InteractiveScript itself: it wires that page's own elements).
export default function ToolsLayout({ children }) {
  return (
    <>
      <SiteHeader scripts={false} />
      {children}
    </>
  );
}
