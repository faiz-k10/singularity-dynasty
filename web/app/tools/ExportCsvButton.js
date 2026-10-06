// Server-rendered on purpose: the button (and the row data it exports)
// should only exist in the HTML sent to Singularity subscribers, not be
// hidden client-side for everyone else. The click itself is handled by a
// single delegated listener in InteractiveScript.js.
//
// Pass `href` instead of columns/rows to point the button at a server route
// that builds the file on request (a plain download link) -- nothing is
// embedded in the page at all. Used where the data set is big.
export default function ExportCsvButton({ id, filename, columns, rows, href }) {
  if (href) {
    return (
      <a className="export-csv-btn" href={href} download={filename}>
        Export CSV
      </a>
    );
  }
  const payload = JSON.stringify({ columns, rows }).replace(/</g, "\\u003c");
  return (
    <>
      <script type="application/json" id={id} dangerouslySetInnerHTML={{ __html: payload }} />
      <button
        type="button"
        className="export-csv-btn"
        data-csv-export={id}
        data-csv-filename={filename}
      >
        Export CSV
      </button>
    </>
  );
}
