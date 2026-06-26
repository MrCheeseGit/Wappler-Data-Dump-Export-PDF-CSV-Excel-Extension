# DataDump Export Extension


**Export any page section to PDF, CSV, or Excel.** Drop the toolbar next to a report, table, or container; pick which format icons to show; use multiple instances on one page with independent targets.

[![License: Mr Cheese Extension v1.0](https://img.shields.io/badge/License-Mr%20Cheese%20Extension%20v1.0-blue.svg)](https://www.mrcheese.co.uk/extension-license)
![Wappler](https://img.shields.io/badge/Wappler-App%20Connect-teal)
![Version](https://img.shields.io/badge/version-1%2E0%2E9-green)

Built by **[Mr Cheese](https://www.mrcheese.co.uk)** · Wappler extensions & custom modules

---

## What it does

1. **DataDump Export:** App Connect component with icon buttons for **PDF**, **CSV**, and **Excel**.
2. Each instance has its own **target selector** (e.g. `#accountsReport`, `.reservations-panel`).
3. Toggle **Show PDF**, **Show CSV**, and **Show Excel** per instance. Only the formats you need appear.
4. **PDF** exports from the **live rendered HTML** in your target (any markup: tables, colours, lists, images). It clones your section off-screen, applies page CSS plus optional **PDF export CSS**, reads **computed styles** (colours, fonts, table bands), then builds the PDF so output closely matches what users see on screen.
5. **CSV** and **Excel** export **table data only** (HTML `<table>` or markdown pipe tables in optional JSON payload).

### PDF highlights (v1.0.9)

| Feature | What it does |
|---------|----------------|
| **Portrait / landscape** | Set **PDF page orientation** in the **Formats** panel (landscape for wide tables and dashboards). |
| **Use page styles in PDF** | On by default: reads computed colours, bold/italic, font sizes, and table header/stripe backgrounds from the live page. |
| **PDF export CSS** | Optional textarea in the **PDF** group: paste CSS used **only during export** (e.g. force white background and dark text on dark-theme sites). |
| **PDF staging background** | Default `#ffffff` on the hidden export copy so dark pages do not export with black backgrounds unless you want them. |
| **Smarter images** | Respects on-screen / `width` attribute size instead of always scaling to a large default. |
| **Cell tones** | `data-export-tone`, `datadump-cell--*` classes, and utilities like `text-success` / `text-danger` for coloured amounts and status text. |

PDF export is client-side (pdfmake): selectable text and tables, no Server Connect step required for the toolbar. It is not pixel-perfect browser print (no flex/grid engine), but it is a strong match for reports, tables, and prose without a server print pipeline.

See [examples/pdf-export-with-image-bullet-list.pdf](examples/pdf-export-with-image-bullet-list.pdf) for a sample PDF with an image, bullet list, and table from a typical export block.

---

## Requirements

- **Font Awesome** (or compatible icons) on your layout. Buttons use `fa-file-pdf`, `fa-file-csv`, `fa-file-excel`.
- **pdfmake** and **SheetJS** load automatically from CDN on first use (URLs configurable in Advanced properties). Self-host under `/public/js/` if CSP blocks CDN scripts.
- Place the toolbar **outside** the export target so buttons are not included in the downloaded file.

---

## Installation

Official Wappler guide: [How To Install Custom Wappler Extensions](https://docs.wappler.io/t/how-to-install-custom-wappler-extensions/49982/).

| Path | |
|------|--|
| **npm** | Wappler Project Settings → Extensions (`wappler-datadump-export`) |
| **Git** | [Extension Installer](https://www.mrcheese.co.uk/extensions/install) or manual copy below |

Git manual copy installs into `extensions/` and `public/`.

### Git install — Extension Installer (recommended)

This repo ships **`wappler-install.json`**. Use the [Mr Cheese Extension Installer](https://www.mrcheese.co.uk/extensions/install), select **DataDump Export**, choose **App Connect**, and run the generated script in your project folder.

### Manual install (Git)

Run from your **Wappler project root**; skip `git clone` if you already cloned this repo alongside your project:

```bash
git clone https://github.com/MrCheeseGit/Wappler-Data-Dump-Export-PDF-CSV-Excel-Extension.git ../Wappler-Data-Dump-Export-PDF-CSV-Excel-Extension

cp ../Wappler-Data-Dump-Export-PDF-CSV-Excel-Extension/app_connect/components.hjson extensions/app_connect/components/datadump_components.hjson
cp ../Wappler-Data-Dump-Export-PDF-CSV-Excel-Extension/includes/dmx-datadump-shared.js public/js/
cp ../Wappler-Data-Dump-Export-PDF-CSV-Excel-Extension/includes/dmx-datadump-export.js public/js/
cp ../Wappler-Data-Dump-Export-PDF-CSV-Excel-Extension/includes/dmx-datadump-export.css public/css/
```

### npm install (Wappler Project Settings)

1. **Wappler** → Project Settings → Extensions → Add → `wappler-datadump-export`
2. From your project root: `npm install`
3. Run **Project Updater → Update** when prompted.
4. **Quit Wappler completely** and reopen your project.

#### Local `file:` development (optional)

```json
"devDependencies": {
  "wappler-datadump-export": "file:../path/to/this-extension"
}
```

After you change extension source, run `npm install` again, then Project Updater if needed, and restart Wappler.

## Usage

### Basic: export a div section

```html
<div id="salesReport" class="card">
  <h2>Monthly summary</h2>
  <table class="table">
    <thead><tr><th>Item</th><th>Amount</th></tr></thead>
    <tbody>
      <tr><td>Widget A</td><td>€450</td></tr>
    </tbody>
  </table>
</div>

<dmx-datadump-export
  id="salesExport"
  target-selector="#salesReport"
  filename-prefix="sales"
  show-pdf="true"
  show-csv="true"
  show-excel="false"
  pdf-footer="My Company Ltd"
></dmx-datadump-export>
```

### Multiple sections on one page

```html
<div id="reportA">…</div>
<dmx-datadump-export id="exportA" target-selector="#reportA" filename-prefix="report-a" show-excel="false"></dmx-datadump-export>

<div id="reportB">…</div>
<dmx-datadump-export id="exportB" target-selector="#reportB" filename-prefix="report-b" show-pdf="false" show-csv="true" show-excel="true"></dmx-datadump-export>
```

Each instance keeps its own target, filename prefix, and visible format icons.

### Error toasts (recommended)

The component fires events; wire your layout notifications:

```html
<dmx-notifications id="notifications" position="top-end"></dmx-notifications>

<dmx-datadump-export
  id="myExport"
  target-selector="#mySection"
  dmx-on:error="notifications.danger(myExport.data.error)"
  dmx-on:pdfDone='notifications.success("PDF downloaded.")'
></dmx-datadump-export>
```

Use **single quotes** on `dmx-on` when the expression contains double-quoted strings.

### Optional structured payload

For AI/report pipelines, bind JSON instead of relying on DOM parsing:

```html
dmx-bind:payload-json="myRow.payloadJson"
```

Shape: `{ "type": "markdown", "body": "…" }`, `{ "type": "html", "body": "…" }`, or `{ "type": "mixed", "parts": […] }`. For HTML reports, prefer `"type": "html"` so tables parse reliably. See [examples/README.md](examples/README.md).

### PDF layout and styling

PDF export snapshots the target element when you click **Export PDF**, mounts a hidden copy in the document (so your theme CSS applies), injects any **PDF export CSS**, then walks the DOM with **computed styles** where enabled.

| Feature | How to use it |
|---------|----------------|
| **Page orientation** | Component property **PDF page orientation** (Formats): Portrait or Landscape |
| **Export-only CSS** | **PDF export CSS** (PDF group): e.g. `#exportTarget { background:#fff; color:#111; }` |
| **Computed styles** | **Use page styles in PDF** (default on); turn off if you need a plain export |
| **Dark themes** | Set **PDF staging background** to `#ffffff` and/or use PDF export CSS for text and table colours |
| **Striped tables** | Any `<table>`; header band and zebra rows follow page CSS when computed styles are on |
| **Cell colours** | `data-export-tone="income\|expenditure\|disbursement\|negative"` on `<td>` / `<th>` (recommended), or classes `datadump-cell--*` |
| **Stacked date/time** | `.datadump-datetime__date` and `.datadump-datetime__time` inside a cell (exports on two lines) |
| **Also recognised** | Common utility classes (`text-success`, `text-danger`, `text-info`) if your theme uses them |
| **Summary blocks** | Table class `datadump-table--summary`, or first row label Total / Subtotal / Balance / Summary |
| **Export sub-region** | Wrap report body in `data-datadump-export-content` inside the target |
| **Skip nodes** | `data-datadump-export-skip` on elements to omit from PDF |
| **Charts (optional)** | `data-datadump-chart` plus `window.DATADUMP_CHARTS.chartHostToPngDataUrl()` if you register a chart helper |

Inline `style="color:…"` on cells (or child `strong` / `span`) is honoured in PDF. CSV and Excel export plain cell text only (colours are PDF-only).

**After updating:** run `npm install` and **Project Updater → Update** if you use npm, then **quit Wappler completely and reopen** so new component properties (orientation, PDF export CSS) appear in the designer. Hard-refresh the browser before testing exports.

---

## Format comparison

| | PDF | CSV | Excel |
|---|-----|-----|-------|
| **Requires table** | No | Yes | Yes |
| **Prose / headings** | Yes | No | No |
| **Bullet / numbered lists** | Yes | No | No |
| **Images** | Yes (same-origin or `data:` URLs) | No | No |
| **Table striping / colours** | Yes (computed page styles, export CSS, `data-export-tone`) | No | No |
| **Live DOM snapshot (PDF)** | Yes, on export click | Uses tables from DOM / payload | Same as CSV |
| **Multiple tables** | Sequential in document | `# Table N` sections in one file | Separate worksheets |
| **Async** | Yes | No | No |
| **Libraries** | pdfmake (lazy) | None | SheetJS (lazy) |

---

## Component properties (summary)

| Group | Key properties |
|-------|----------------|
| **Export target** | Target selector, Export title, Filename prefix, Structured payload (JSON) |
| **Formats** | Show PDF, Show CSV, Show Excel, Show PDF footer date/time, **PDF page orientation** (portrait / landscape) |
| **PDF** | PDF footer text, Locale, **PDF export CSS**, **Use page styles in PDF**, PDF staging background, PDF max image width |
| **Labels & errors** | Button labels and error messages (support `dmx-bind:` for i18n) |
| **Advanced** | pdfmake / SheetJS CDN URLs, toolbar CSS classes |

---

## Programmatic API

After install, `window.DATADUMP_EXPORT` is available for custom scripts:

```javascript
var item = DATADUMP_EXPORT.buildItemFromElement(document.querySelector('#mySection'), {
  title: 'My report',
  filenamePrefix: 'report'
});
DATADUMP_EXPORT.exportPdf({ item: item, labels: { footer: 'My Co' }, filenamePrefix: 'report' });
```

---

## Compatibility

Standalone extension. For shared patterns (Redirect-IT step order, PuSH-IT, optional pairs), see [Mr Cheese extension docs](https://github.com/MrCheeseGit/Wappler-Extension-Docs/blob/main/extension-compatibility.md).

## License

[Mr Cheese Extension License v1.0](https://www.mrcheese.co.uk/extension-license) — see [LICENSE](LICENSE). © [Mr Cheese](https://www.mrcheese.co.uk)
