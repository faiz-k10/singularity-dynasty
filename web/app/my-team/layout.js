import SiteHeader from "../SiteHeader";

// Same as app/tools/layout.js: the header stays mounted while My Team's data loads.
export default function MyTeamLayout({ children }) {
  return (
    <>
      <SiteHeader scripts={false} />
      {children}
    </>
  );
}
