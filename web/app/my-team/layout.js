import SiteHeader from "../SiteHeader";

// Same as app/tools/layout.js: wrapper + header stay mounted while My Team's data loads, and its full-screen board covers the header.
export default function MyTeamLayout({ children }) {
  return (
    <div className="tool-page">
      <SiteHeader scripts={false} />
      {children}
    </div>
  );
}
