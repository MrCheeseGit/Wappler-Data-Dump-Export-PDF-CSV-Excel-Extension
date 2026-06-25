# DataDump Export: examples

## Sample PDF

[pdf-export-with-image-bullet-list.pdf](pdf-export-with-image-bullet-list.pdf) shows a real export from a demo page section: heading, prose, **image**, **bullet list**, and table. It is a very good representation of what you see in the browser for that block (layout and styling may differ slightly from the live page).

## Page layout pattern

```html
<!-- Content to export (keep toolbar outside this block) -->
<div id="reportPanel">
  <h2>Weekly summary</h2>
  <table class="table table-striped">
    <thead>
      <tr><th>Name</th><th>Date</th><th>Score</th></tr>
    </thead>
    <tbody>
      <tr><td>Jane Doe</td><td>2026-06-10</td><td>92</td></tr>
      <tr><td>John Smith</td><td>2026-06-12</td><td>88</td></tr>
    </tbody>
  </table>
</div>

<!-- Toolbar: only CSV + Excel for this section -->
<dmx-datadump-export
  id="reportExport"
  target-selector="#reportPanel"
  filename-prefix="weekly-report"
  show-pdf="false"
  show-csv="true"
  show-excel="true"
></dmx-datadump-export>
```

## Structured payload (markdown table)

Bind when content is generated client-side and not only in the DOM:

```json
{
  "type": "markdown",
  "body": "## Summary\n\n| Item | Status |\n| --- | --- |\n| Alpha | Active |\n| Beta | Pending |"
}
```

```html
<dmx-datadump-export
  id="dynamicExport"
  target-selector="#outputPanel"
  dmx-bind:payload-json="currentRow.payloadJson"
  dmx-bind:export-title="currentRow.title"
></dmx-datadump-export>
```

## Filename pattern

Downloads use:

```
{filename-prefix}-{slug-title}-{yyyy-MM-dd}.{pdf|csv|xlsx}
```

Example: `weekly-report-summary-2026-06-04.xlsx`
