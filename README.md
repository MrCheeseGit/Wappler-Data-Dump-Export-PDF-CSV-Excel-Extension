# DataDump Export Extension


**Export any page section to PDF, CSV, or Excel.** Drop the toolbar next to a report, table, or container; pick which format icons to show; use multiple instances on one page with independent targets.

[![License: Mr Cheese Extension v1.0](https://img.shields.io/badge/License-Mr%20Cheese%20Extension%20v1.0-blue.svg)](https://www.mrcheese.co.uk/extension-license)
![Wappler](https://img.shields.io/badge/Wappler-App%20Connect-teal)
![Version](https://img.shields.io/badge/version-1%2E0%2E7-green)

Built by **[Mr Cheese](https://www.mrcheese.co.uk)** · Wappler extensions & custom modules

---

## What it does

1. **DataDump Export:** App Connect component with icon buttons for **PDF**, **CSV**, and **Excel**.
2. Each instance has its own **target selector** (e.g. `#accountsReport`, `.reservations-panel`).
3. Toggle **Show PDF**, **Show CSV**, and **Show Excel** per instance. Only the formats you need appear.
4. **PDF** exports full content (headings, prose, **bullet and numbered lists**, tables, and **images**) from the target HTML or structured payload. Output is a very good representation of the section you export (if not always pixel-perfect).
5. **CSV** and **Excel** export **table data only** (HTML `<table>` or markdown pipe tables in optional JSON payload).

See [examples/pdf-export-with-image-bullet-list.pdf](examples/pdf-export-with-image-bullet-list.pdf) for a sample PDF with an image, bullet list, and table from a typical export block.

---

## Requirements

- **Font Awesome** (or compatible icons) on your layout. Buttons use `fa-file-pdf`, `fa-file-csv`, `fa-file-excel`.
- **pdfmake** and **SheetJS** load automatically from CDN on first use (URLs configurable in Advanced properties). Self-host under `/public/js/` if CSP blocks CDN scripts.
- Place the toolbar **outside** the export target so buttons are not included in the downloaded file.

---

## Installation

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

Shape: `{ "type": "markdown", "body": "…" }` or `{ "type": "mixed", "parts": […] }`. See [examples/README.md](examples/README.md).

---

## Format comparison

| | PDF | CSV | Excel |
|---|-----|-----|-------|
| **Requires table** | No | Yes | Yes |
| **Prose / headings** | Yes | No | No |
| **Bullet / numbered lists** | Yes | No | No |
| **Images** | Yes (same-origin or `data:` URLs) | No | No |
| **Multiple tables** | Sequential in document | `# Table N` sections in one file | Separate worksheets |
| **Async** | Yes | No | No |
| **Libraries** | pdfmake (lazy) | None | SheetJS (lazy) |

---

## Component properties (summary)

| Group | Key properties |
|-------|----------------|
| **Export target** | Target selector, Export title, Filename prefix, Structured payload (JSON) |
| **Formats** | Show PDF, Show CSV, Show Excel |
| **PDF** | PDF footer text, Locale, Show PDF footer timestamp |
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
