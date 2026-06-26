/**
 * DataDump: shared PDF / CSV / Excel export engine (client-side).
 * Used by dmx-datadump-export and available as window.DATADUMP_EXPORT.
 */
(function () {
  'use strict';

  var PDF_NEGATIVE_COLOR = '#dc2626';
  var PDF_INCOME_COLOR = '#15803d';
  var PDF_EXPENDITURE_COLOR = PDF_NEGATIVE_COLOR;
  var PDF_DISBURSEMENT_COLOR = '#0d9488';
  var PDF_TABLE_HEADER_FILL = '#e8edf4';
  var PDF_TABLE_STRIPE_FILL = '#f4f7fa';
  var PDF_TABLE_LINE_COLOR = '#d0d5dd';

  function slugFilename(name) {
    return String(name || 'export')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 48) || 'export';
  }

  function dateStamp() {
    try {
      return new Date().toISOString().slice(0, 10);
    } catch (_) {
      return 'export';
    }
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 4000);
  }

  function parseTableRow(line) {
    return line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(function (cell) {
        return cell.trim();
      });
  }

  function isSeparatorRow(line) {
    return /^\|[\s:|\-]+\|$/.test(String(line || '').trim());
  }

  function extractMarkdownTables(text) {
    var lines = String(text || '').split('\n');
    var tables = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i].trim();
      if (/^\|.+\|$/.test(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
        var headers = parseTableRow(line);
        i += 2;
        var rows = [];
        while (i < lines.length && /^\|.+\|$/.test(lines[i].trim()) && !isSeparatorRow(lines[i])) {
          rows.push(parseTableRow(lines[i].trim()));
          i += 1;
        }
        if (headers.length) {
          tables.push({ headers: headers, rows: rows });
        }
      } else {
        i += 1;
      }
    }

    return tables;
  }

  function pdfStripedTableLayout(options) {
    options = options || {};
    var headerRows = options.headerRows == null ? 1 : options.headerRows;

    return {
      hLineWidth: function (i, node) {
        return (i === 0 || i === node.table.body.length) ? 0.8 : 0.4;
      },
      vLineWidth: function () {
        return 0;
      },
      hLineColor: function () {
        return PDF_TABLE_LINE_COLOR;
      },
      paddingLeft: function () {
        return 6;
      },
      paddingRight: function () {
        return 6;
      },
      paddingTop: function () {
        return 4;
      },
      paddingBottom: function () {
        return 4;
      },
      fillColor: function (rowIndex, node, colIndex) {
        if (options.cellFillColors && options.cellFillColors[rowIndex] && options.cellFillColors[rowIndex][colIndex]) {
          return options.cellFillColors[rowIndex][colIndex];
        }
        if (headerRows > 0 && rowIndex === 0) {
          return options.headerFill || PDF_TABLE_HEADER_FILL;
        }
        return rowIndex % 2 === 1 ? (options.stripeFill || PDF_TABLE_STRIPE_FILL) : null;
      },
    };
  }

  function parseInlineColorFromStyle(styleAttr) {
    var style = String(styleAttr || '');
    var match = style.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|[a-zA-Z]+)/i);
    return match ? match[1].trim() : null;
  }

  function cssColorToPdfColor(value) {
    if (!value) return null;
    var v = String(value).trim();
    if (!v || v === 'transparent' || v === 'rgba(0, 0, 0, 0)') return null;
    if (v.charAt(0) === '#') {
      if (v.length === 4) {
        return '#' + v.charAt(1) + v.charAt(1) + v.charAt(2) + v.charAt(2) + v.charAt(3) + v.charAt(3);
      }
      return v;
    }
    var rgb = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgb) {
      return '#' + [rgb[1], rgb[2], rgb[3]].map(function (part) {
        var hex = parseInt(part, 10).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      }).join('');
    }
    return null;
  }

  function isBoldFontWeight(weight) {
    var n = parseInt(weight, 10);
    if (!isNaN(n)) return n >= 600;
    return String(weight || '').toLowerCase() === 'bold';
  }

  function readComputedTextStyles(el) {
    if (!el || typeof getComputedStyle !== 'function') return null;
    var cs = getComputedStyle(el);
    var props = {};
    var color = cssColorToPdfColor(cs.color);
    if (color) props.color = color;
    if (isBoldFontWeight(cs.fontWeight)) props.bold = true;
    if (String(cs.fontStyle || '').toLowerCase() === 'italic') props.italics = true;
    var fontSize = parseFloat(cs.fontSize);
    if (fontSize > 0) props.fontSize = Math.max(6, Math.round(fontSize * 0.75));
    var align = String(cs.textAlign || '').toLowerCase();
    if (align === 'center' || align === 'right' || align === 'left') {
      props.alignment = align;
    }
    return props;
  }

  function applyComputedTextStyles(block, el, pdfOptions) {
    if (!block || !el || !pdfOptions || !pdfOptions.useComputedStyles) return block;
    var computed = readComputedTextStyles(el);
    if (!computed) return block;
    if (computed.color) block.color = computed.color;
    if (computed.bold) block.bold = true;
    if (computed.italics) block.italics = true;
    if (computed.fontSize) block.fontSize = computed.fontSize;
    if (computed.alignment) block.alignment = computed.alignment;
    return block;
  }

  function applyComputedStyleToExportCell(exportCell, cell, pdfOptions) {
    if (!exportCell || typeof exportCell !== 'object' || !cell || !pdfOptions || !pdfOptions.useComputedStyles) {
      return exportCell;
    }
    if (typeof getComputedStyle !== 'function') return exportCell;

    var cs = getComputedStyle(cell);
    var color = cssColorToPdfColor(cs.color);
    if (color && !exportCell.color) exportCell.color = color;
    if (isBoldFontWeight(cs.fontWeight)) exportCell.bold = true;

    var bg = cssColorToPdfColor(cs.backgroundColor);
    if (bg) exportCell.backgroundColor = bg;

    return exportCell;
  }

  function cellExportTone(cell) {
    if (!cell || !cell.getAttribute) return null;

    var toneAttr = cell.getAttribute('data-export-tone');
    if (toneAttr === 'income' || toneAttr === 'expenditure' || toneAttr === 'disbursement' || toneAttr === 'negative') {
      return toneAttr;
    }

    if (cell.classList) {
      if (cell.classList.contains('datadump-cell--income')) return 'income';
      if (cell.classList.contains('datadump-cell--expenditure')) return 'expenditure';
      if (cell.classList.contains('datadump-cell--disbursement')) return 'disbursement';
      if (cell.classList.contains('datadump-cell--negative')) return 'negative';
      if (cell.classList.contains('text-success')) return 'income';
      if (cell.classList.contains('text-danger')) return 'negative';
      if (cell.classList.contains('text-info')) return 'disbursement';
    }

    if (cell.querySelector) {
      var toneChild = cell.querySelector('[data-export-tone], .text-success, .text-danger, .text-info');
      if (toneChild) {
        return cellExportTone(toneChild);
      }
    }

    return null;
  }

  function htmlCellToExportCell(cell, pdfOptions) {
    var dateEl = cell.querySelector && cell.querySelector('.datadump-datetime__date');
    var timeEl = cell.querySelector && cell.querySelector('.datadump-datetime__time');
    var text = '';

    if (dateEl) {
      text = (dateEl.textContent || '').trim();
      if (timeEl && (timeEl.textContent || '').trim()) {
        text = text + '\n' + (timeEl.textContent || '').trim();
      }
    } else {
      text = (cell.textContent || '').trim();
    }

    if (!text) return '';

    var exportCell = { text: text };
    var tone = cellExportTone(cell);
    if (tone) {
      exportCell.tone = tone;
    }

    var inlineColor = parseInlineColorFromStyle(cell.getAttribute('style'));
    if (!inlineColor && cell.querySelector) {
      var styledChild = cell.querySelector('strong[style], span[style]');
      if (styledChild) {
        inlineColor = parseInlineColorFromStyle(styledChild.getAttribute('style'));
      }
    }
    if (inlineColor) {
      exportCell.color = inlineColor;
    }

    applyComputedStyleToExportCell(exportCell, cell, pdfOptions);

    if (exportCell.tone || exportCell.color || exportCell.bold || exportCell.backgroundColor) {
      return exportCell;
    }
    return text;
  }

  function paymentToneFromText(value) {
    if (value && typeof value === 'object') {
      if (value.tone && value.tone !== 'negative') return value.tone;
      if (value.text != null) value = value.text;
    }
    var t = String(value || '').trim().toLowerCase();
    if (t === 'income' || t === 'receita') return 'income';
    if (t === 'expenditure' || t === 'despesa' || t === 'expense' || t === 'expenses') return 'expenditure';
    return null;
  }

  function isMoneyLikeHeader(header) {
    var h = cellPlainText(header).trim().toLowerCase();
    return /^(total|paid|amount|balance|iva|retention|valor|pago|montante|saldo)$/.test(h);
  }

  function findTypeColumnIndex(headers) {
    var i;
    for (i = 0; i < headers.length; i += 1) {
      var label = cellPlainText(headers[i]).trim().toLowerCase();
      if (label === 'type' || label === 'tipo') return i;
    }
    return -1;
  }

  function cellPlainText(cell) {
    if (cell && typeof cell === 'object' && cell.text != null) {
      return String(cell.text);
    }
    return cell == null ? '' : String(cell);
  }

  function cellToPdfCell(cell, options) {
    var text = '';
    var tone = null;
    var color = null;
    var boldFlag = false;
    var fillColor = null;

    if (cell && typeof cell === 'object' && cell.text != null) {
      text = stripInlineMarkdown(cell.text);
      tone = cell.tone || (cell.negative ? 'negative' : null);
      color = cell.color || null;
      boldFlag = !!cell.bold;
      fillColor = cell.backgroundColor || null;
    } else {
      text = stripInlineMarkdown(cell);
      if (options && options.rowTone) {
        tone = options.rowTone;
      } else if (/^-/.test(String(text).trim())) {
        tone = 'negative';
      }
    }

    if (!text) return '';

    if (!tone && !color && !boldFlag && !fillColor) return text;

    var pdfCell = { text: text };
    if (fillColor) pdfCell.fillColor = fillColor;
    if (color) {
      pdfCell.color = color;
      pdfCell.bold = true;
    } else if (tone === 'income') {
      pdfCell.style = 'pdfIncomeCell';
    } else if (tone === 'expenditure') {
      pdfCell.style = 'pdfExpenditureCell';
    } else if (tone === 'disbursement') {
      pdfCell.style = 'pdfDisbursementCell';
    } else if (tone === 'negative') {
      pdfCell.style = 'pdfNegativeCell';
    }
    if (boldFlag && !pdfCell.bold) pdfCell.bold = true;
    return pdfCell;
  }

  function isSummaryOutputTable(table) {
    if (!table || !table.getAttribute) return false;
    var cls = table.getAttribute('class') || '';
    if (/\bdatadump-table--summary\b/.test(cls)) return true;
    if (table.querySelector && table.querySelector('thead')) return false;
    var rows = table.querySelectorAll('tr');
    if (!rows.length) return false;
    var firstLabel = '';
    var firstRow = rows[0];
    if (firstRow) {
      var firstCell = firstRow.querySelector('th[scope="row"], th, td');
      if (firstCell) firstLabel = (firstCell.textContent || '').trim().toLowerCase();
    }
    return /^(total|subtotal|records|registos|saldo|balance|resumo|summary)/.test(firstLabel);
  }

  function extractTableMatrixFromElement(table, pdfOptions) {
    if (!table || !table.querySelectorAll) return null;

    var matrix = [];
    table.querySelectorAll('tr').forEach(function (tr) {
      var cells = [];
      tr.querySelectorAll('th, td').forEach(function (cell) {
        cells.push(htmlCellToExportCell(cell, pdfOptions));
      });
      if (cells.length) matrix.push(cells);
    });

    if (!matrix.length) return null;

    if (isSummaryOutputTable(table)) {
      return { isSummary: true, headers: [], rows: matrix };
    }

    return { headers: matrix[0], rows: matrix.slice(1) };
  }

  function extractTablesFromHtml(html) {
    var wrap = document.createElement('div');
    wrap.innerHTML = String(html || '');
    var tables = [];

    wrap.querySelectorAll('table').forEach(function (table) {
      var parsed = extractTableMatrixFromElement(table);
      if (parsed) tables.push(parsed);
    });

    return tables;
  }

  function countTonedCellsInTables(tables) {
    var count = 0;
    tables.forEach(function (table) {
      var rows = table.isSummary ? table.rows : [table.headers].concat(table.rows);
      rows.forEach(function (row) {
        if (!row) return;
        row.forEach(function (cell) {
          if (cell && typeof cell === 'object' && (cell.tone || cell.color)) {
            count += 1;
          }
        });
      });
    });
    return count;
  }

  function scorePdfHtmlCandidate(html) {
    var tables = extractTablesFromHtml(html);
    return {
      tableCount: tables.length,
      summaryCount: tables.filter(function (table) { return table.isSummary; }).length,
      toneCount: countTonedCellsInTables(tables),
    };
  }

  function extractExportContentHtml(html) {
    if (!html) return '';
    var wrap = document.createElement('div');
    wrap.innerHTML = String(html);
    var content = wrap.querySelector('[data-datadump-export-content]');
    if (content && content.innerHTML) return content.innerHTML;
    return wrap.innerHTML;
  }

  function resolveItemHtmlForPdf(item) {
    if (!item) return '';
    if (item._pdfHtml) return String(item._pdfHtml);

    var candidates = [];

    if (item.payload && item.payload.type === 'html' && item.payload.body) {
      candidates.push(String(item.payload.body));
    }

    if (item.html) {
      candidates.push(extractExportContentHtml(item.html));
    }

    if (!candidates.length) return '';

    var bestHtml = candidates[0];
    var best = scorePdfHtmlCandidate(bestHtml);
    var i;

    for (i = 1; i < candidates.length; i += 1) {
      var score = scorePdfHtmlCandidate(candidates[i]);
      if (
        score.tableCount > best.tableCount
        || (score.tableCount === best.tableCount && score.summaryCount > best.summaryCount)
        || (score.tableCount === best.tableCount && score.summaryCount === best.summaryCount && score.toneCount > best.toneCount)
      ) {
        best = score;
        bestHtml = candidates[i];
      }
    }

    return bestHtml;
  }

  function shouldBuildPdfFromHtml(item) {
    if (!item) return false;
    if (item._pdfHtml) return true;
    if (item.html && String(item.html).trim()) return true;
    return !!(item.payload && item.payload.type === 'html' && item.payload.body);
  }

  function collectTextBodies(payload) {
    var chunks = [];
    if (!payload) return chunks;

    if (payload.type === 'mixed' && Array.isArray(payload.parts)) {
      payload.parts.forEach(function (part) {
        if (part && part.body && part.type !== 'image' && part.type !== 'map' && part.type !== 'html') {
          chunks.push(String(part.body));
        }
      });
      return chunks;
    }

    if (payload.type === 'markdown' && payload.body) {
      chunks.push(String(payload.body));
      return chunks;
    }

    if (payload.type !== 'html' && payload.body) {
      chunks.push(String(payload.body));
    }
    return chunks;
  }

  function collectTablesFromItem(item) {
    var tables = [];
    var payload = item && item.payload;

    if (payload && payload.type === 'html' && payload.body) {
      tables = extractTablesFromHtml(payload.body);
      if (tables.length) return tables;
    }

    var bodies = collectTextBodies(payload);

    bodies.forEach(function (body) {
      extractMarkdownTables(body).forEach(function (table) {
        tables.push(table);
      });
    });

    if (!tables.length && item && item.html) {
      tables = extractTablesFromHtml(extractExportContentHtml(item.html));
    }

    return tables;
  }

  function rowToCsv(cells) {
    return cells.map(function (cell) {
      var value = cellPlainText(cell);
      if (/[",\n\r]/.test(value)) {
        return '"' + value.replace(/"/g, '""') + '"';
      }
      return value;
    }).join(',');
  }

  function tablesToCsv(tables) {
    var lines = [];
    tables.forEach(function (table, index) {
      if (index > 0) lines.push('');
      if (tables.length > 1) {
        lines.push('# Table ' + (index + 1));
      }
      if (table.isSummary) {
        table.rows.forEach(function (row) {
          lines.push(rowToCsv(row));
        });
      } else {
        lines.push(rowToCsv(table.headers));
        table.rows.forEach(function (row) {
          lines.push(rowToCsv(row));
        });
      }
    });
    return '\uFEFF' + lines.join('\r\n');
  }

  function stripInlineMarkdown(text) {
    return String(text || '')
      .replace(/!\[[^\]]*]\([^)]*\)/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .trim();
  }

  function isPdfFollowUpLine(line) {
    var t = stripInlineMarkdown(line);
    if (!t) return false;

    return (
      /^let me know if (you(?:'d| would) like|you want|i can)/i.test(t) ||
      /^feel free to (ask|let me know)/i.test(t) ||
      /^would you like (me to|to|a|an)/i.test(t) ||
      /^if you(?:'d| would) like/i.test(t) ||
      /^i can also (help|prepare|create|suggest|provide|draft|put)/i.test(t) ||
      /^just let me know/i.test(t)
    );
  }

  function isPdfFollowUpContinuation(line) {
    var t = stripInlineMarkdown(line);
    if (!t) return false;
    return (
      /^(?:or|and)\b/i.test(t) ||
      /^[-*•]\s+/.test(t) ||
      (/^(?:a|an|the)\s+/i.test(t) && t.length < 160)
    );
  }

  function stripPdfFollowUpPrompts(text) {
    var lines = String(text || '').split('\n');
    var end = lines.length;

    while (end > 0 && !lines[end - 1].trim()) {
      end -= 1;
    }
    if (!end) return '';

    var blockStart = end;
    var inFollowUp = false;
    var i;

    for (i = end - 1; i >= 0; i -= 1) {
      var trimmed = lines[i].trim();

      if (!trimmed) {
        if (inFollowUp) {
          blockStart = i;
          continue;
        }
        break;
      }

      if (isPdfFollowUpLine(trimmed) || (inFollowUp && isPdfFollowUpContinuation(trimmed))) {
        inFollowUp = true;
        blockStart = i;
        continue;
      }

      break;
    }

    if (!inFollowUp) return String(text || '');

    return lines.slice(0, blockStart).join('\n').replace(/\s+$/, '');
  }

  function tableToPdfSummaryBlock(table, tableEl, pdfOptions) {
    var colCount = 0;
    table.rows.forEach(function (row) {
      if (row.length > colCount) colCount = row.length;
    });
    if (!colCount) colCount = 2;

    var body = table.rows.map(function (row) {
      return row.map(function (cell) {
        var pdfCell = cellToPdfCell(cell);
        if (typeof pdfCell === 'string') {
          return pdfCell ? { text: pdfCell, bold: true } : '';
        }
        pdfCell.bold = true;
        return pdfCell;
      }).concat(new Array(Math.max(0, colCount - row.length)).fill(''));
    });

    var widths = [];
    var c;
    for (c = 0; c < colCount; c += 1) {
      widths.push(c === 0 ? 'auto' : '*');
    }

    return {
      table: {
        headerRows: 0,
        widths: widths,
        body: body,
      },
      layout: pdfStripedTableLayout(Object.assign({ headerRows: 0 }, readTableLayoutFromElement(tableEl, pdfOptions))),
      margin: [0, 10, 0, 12],
      fontSize: 9,
    };
  }

  function tableToPdfBlock(table, tableEl, pdfOptions) {
    if (table.isSummary) {
      return tableToPdfSummaryBlock(table, tableEl, pdfOptions);
    }

    var colCount = table.headers.length || 1;
    var typeCol = findTypeColumnIndex(table.headers);
    var headers = table.headers.map(function (cell) {
      return cellToPdfCell(cell);
    });
    var rows = table.rows.map(function (row) {
      var rowTone = typeCol >= 0 ? paymentToneFromText(row[typeCol]) : null;
      var cells = row.map(function (cell, colIndex) {
        var cellOpts = null;
        if (rowTone) {
          var hasTone = cell && typeof cell === 'object' && (cell.tone || cell.color);
          if (!hasTone && (colIndex === typeCol || isMoneyLikeHeader(table.headers[colIndex]))) {
            cellOpts = { rowTone: rowTone };
          }
        }
        return cellToPdfCell(cell, cellOpts);
      });
      while (cells.length < colCount) cells.push('');
      if (cells.length > colCount) cells.length = colCount;
      return cells;
    });
    var body = [headers].concat(rows);
    var widths = [];
    var c;
    for (c = 0; c < colCount; c += 1) {
      widths.push('*');
    }
    var layoutOpts = readTableLayoutFromElement(tableEl, pdfOptions);
    return {
      table: {
        headerRows: 1,
        widths: widths,
        body: body,
      },
      layout: pdfStripedTableLayout(layoutOpts),
      margin: [0, 6, 0, 12],
      fontSize: 8,
    };
  }

  function readTableLayoutFromElement(tableEl, pdfOptions) {
    var layoutOpts = { headerRows: 1 };
    if (!tableEl || !pdfOptions || !pdfOptions.useComputedStyles || typeof getComputedStyle !== 'function') {
      return layoutOpts;
    }

    var th = tableEl.querySelector('thead th, tr:first-child th');
    if (th) {
      var headerBg = cssColorToPdfColor(getComputedStyle(th).backgroundColor);
      if (headerBg) layoutOpts.headerFill = headerBg;
    }

    var stripeTr = tableEl.querySelector('tbody tr:nth-child(even), tr:nth-child(even)');
    if (stripeTr) {
      var stripeBg = cssColorToPdfColor(getComputedStyle(stripeTr).backgroundColor);
      if (stripeBg) layoutOpts.stripeFill = stripeBg;
    }

    return layoutOpts;
  }

  function markdownBlocksToPdf(text, tableSink) {
    var content = [];
    var lines = String(text || '').split('\n');
    var listItems = [];
    var listOrdered = false;

    function flushList() {
      if (!listItems.length) return;
      if (listOrdered) {
        content.push({ ol: listItems.slice(), margin: [0, 4, 0, 8], style: 'body' });
      } else {
        content.push({ ul: listItems.slice(), margin: [0, 4, 0, 8], style: 'body' });
      }
      listItems = [];
      listOrdered = false;
    }

    var i = 0;
    while (i < lines.length) {
      var trimmed = lines[i].trim();
      if (!trimmed) {
        flushList();
        i += 1;
        continue;
      }

      if (/^\|.+\|$/.test(trimmed) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
        flushList();
        var headers = parseTableRow(trimmed);
        i += 2;
        var rows = [];
        while (i < lines.length && /^\|.+\|$/.test(lines[i].trim()) && !isSeparatorRow(lines[i])) {
          rows.push(parseTableRow(lines[i].trim()));
          i += 1;
        }
        if (headers.length) {
          var table = { headers: headers, rows: rows };
          tableSink.push(table);
          content.push(tableToPdfBlock(table));
        }
        continue;
      }

      if (/^#{1,3}\s+/.test(trimmed)) {
        flushList();
        content.push({
          text: stripInlineMarkdown(trimmed.replace(/^#{1,3}\s+/, '')),
          style: 'h2',
        });
        i += 1;
        continue;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        listItems.push(stripInlineMarkdown(trimmed.replace(/^[-*]\s+/, '')));
        listOrdered = false;
        i += 1;
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        listItems.push(stripInlineMarkdown(trimmed.replace(/^\d+\.\s+/, '')));
        listOrdered = true;
        i += 1;
        continue;
      }

      flushList();
      content.push({ text: stripInlineMarkdown(trimmed), style: 'body', margin: [0, 0, 0, 6] });
      i += 1;
    }

    flushList();
    return content;
  }

  function shouldSkipDomNode(node) {
    if (!node || node.nodeType !== 1) return true;
    var tag = node.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'button' || tag === 'noscript') return true;
    if (node.hasAttribute && node.hasAttribute('data-datadump-export-skip')) return true;
    if (node.classList && node.classList.contains('datadump-export-toolbar')) return true;
    if (node.closest && (
      node.closest('.datadump-export-toolbar')
      || node.closest('[data-datadump-export-skip]')
    )) return true;
    return false;
  }

  function resolvePdfChartHost(node) {
    if (!node || node.nodeType !== 1) return null;
    if (node.hasAttribute && node.hasAttribute('data-datadump-chart')) return node;
    if (node.classList && node.classList.contains('datadump-export-chart')) return node;
    if (node.querySelector) {
      var nested = node.querySelector('[data-datadump-chart], .datadump-export-chart');
      if (nested) return nested;
    }
    return null;
  }

  function chartHostToPdfBlocks(chartHost, labels) {
    var chartsMod = window.DATADUMP_CHARTS;
    if (!chartHost || !chartsMod || typeof chartsMod.chartHostToPngDataUrl !== 'function') {
      return Promise.resolve([]);
    }

    return chartsMod.chartHostToPngDataUrl(chartHost).then(function (dataUrl) {
      if (dataUrl) {
        return [{
          image: dataUrl,
          width: 480,
          margin: [0, 8, 0, 12],
          alignment: 'center',
        }];
      }
      if (labels && labels.imagePlaceholder) {
        return [{ text: labels.imagePlaceholder, style: 'muted', italics: true }];
      }
      return [];
    });
  }

  function normalizePdfOrientation(value) {
    return String(value || 'portrait').toLowerCase() === 'landscape' ? 'landscape' : 'portrait';
  }

  function resolvePdfOptions(options) {
    options = options || {};
    var maxW = parseInt(options.pdfMaxImageWidth, 10);
    return {
      pageOrientation: normalizePdfOrientation(options.pageOrientation),
      maxImageWidth: maxW > 0 ? maxW : 420,
      useComputedStyles: options.pdfUseComputedStyles !== false,
      pageBackground: options.pdfPageBackground || '#ffffff',
      exportCss: options.pdfExportCss || '',
    };
  }

  function cleanupPdfStaging(item) {
    if (!item) return;
    if (item._pdfStagingHost && item._pdfStagingHost.parentNode) {
      item._pdfStagingHost.parentNode.removeChild(item._pdfStagingHost);
    }
    delete item._pdfStagingHost;
    delete item._pdfRoot;
  }

  function preparePdfStaging(item, targetEl, options) {
    cleanupPdfStaging(item);
    if (!item || !targetEl) return item;

    options = options || {};
    var pdfOptions = resolvePdfOptions(options);

    var clone = targetEl.cloneNode(true);
    clone.querySelectorAll('.datadump-export-toolbar, [data-datadump-export-skip]').forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });

    var host = document.createElement('div');
    host.setAttribute('data-datadump-pdf-staging', '1');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;max-width:794px;visibility:hidden;pointer-events:none;overflow:hidden;';
    host.style.backgroundColor = pdfOptions.pageBackground || '#ffffff';

    if (pdfOptions.exportCss) {
      var styleEl = document.createElement('style');
      styleEl.setAttribute('data-datadump-pdf-export-css', '1');
      styleEl.textContent = String(pdfOptions.exportCss);
      host.appendChild(styleEl);
    }

    host.appendChild(clone);
    document.body.appendChild(host);

    var contentEl = clone.querySelector('[data-datadump-export-content]');
    item._pdfRoot = contentEl || clone;
    item._pdfStagingHost = host;
    item._pdfHtml = contentEl ? contentEl.innerHTML : clone.innerHTML;
    return item;
  }

  function pdfImageWidthPt(imgEl, maxWidthPt) {
    var cap = maxWidthPt > 0 ? maxWidthPt : 420;
    if (!imgEl || !imgEl.getAttribute) return cap;

    var widthAttr = parseInt(imgEl.getAttribute('width'), 10);
    if (widthAttr > 0) return Math.min(widthAttr, cap);

    var styleAttr = imgEl.getAttribute('style') || '';
    var styleMatch = styleAttr.match(/(?:^|;)\s*width:\s*(\d+(?:\.\d+)?)px/i);
    if (styleMatch) {
      var stylePx = parseFloat(styleMatch[1]);
      if (stylePx > 0) return Math.min(Math.round(stylePx * 0.75), cap);
    }

    if (typeof getComputedStyle === 'function') {
      var rendered = parseFloat(getComputedStyle(imgEl).width);
      if (rendered > 0) return Math.min(Math.round(rendered * 0.75), cap);
    }

    return cap;
  }

  function processPdfNodesSequentially(nodes, labels, pdfOptions) {
    return nodes.reduce(function (chain, node) {
      return chain.then(function (acc) {
        return processPdfNode(node, labels, pdfOptions).then(function (blocks) {
          return acc.concat(blocks);
        });
      });
    }, Promise.resolve([]));
  }

  function processPdfNode(node, labels, pdfOptions) {
    if (!node) return Promise.resolve([]);
    if (shouldSkipDomNode(node)) return Promise.resolve([]);

    if (node.nodeType === 3) {
      var t = node.textContent.replace(/\s+/g, ' ').trim();
      if (t) return Promise.resolve([{ text: t, style: 'body', margin: [0, 0, 0, 6] }]);
      return Promise.resolve([]);
    }

    if (node.nodeType !== 1) return Promise.resolve([]);

    var tag = node.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
      var headingBlock = {
        text: (node.textContent || '').trim(),
        style: tag === 'h1' ? 'title' : 'h2',
      };
      applyComputedTextStyles(headingBlock, node, pdfOptions);
      return Promise.resolve([headingBlock]);
    }

    if (tag === 'table') {
      var parsedTable = extractTableMatrixFromElement(node, pdfOptions);
      if (parsedTable) {
        return Promise.resolve([tableToPdfBlock(parsedTable, node, pdfOptions)]);
      }
      return Promise.resolve([]);
    }

    if (tag === 'ul') {
      var ulItems = [];
      node.querySelectorAll(':scope > li').forEach(function (li) {
        var liText = (li.textContent || '').trim();
        if (liText) ulItems.push(liText);
      });
      if (ulItems.length) {
        return Promise.resolve([{ ul: ulItems, margin: [0, 4, 0, 8], style: 'body' }]);
      }
      return Promise.resolve([]);
    }

    if (tag === 'ol') {
      var olItems = [];
      node.querySelectorAll(':scope > li').forEach(function (li) {
        var liText = (li.textContent || '').trim();
        if (liText) olItems.push(liText);
      });
      if (olItems.length) {
        return Promise.resolve([{ ol: olItems, margin: [0, 4, 0, 8], style: 'body' }]);
      }
      return Promise.resolve([]);
    }

    if (tag === 'p' || tag === 'blockquote' || tag === 'pre') {
      var pt = (node.textContent || '').trim();
      if (pt) {
        var paragraphBlock = { text: pt, style: 'body', margin: [0, 0, 0, 6] };
        applyComputedTextStyles(paragraphBlock, node, pdfOptions);
        return Promise.resolve([paragraphBlock]);
      }
      return Promise.resolve([]);
    }

    if (tag === 'img') {
      var src = node.getAttribute('src');
      var maxImageWidth = (pdfOptions && pdfOptions.maxImageWidth) || 420;
      return toDataUrl(src).then(function (dataUrl) {
        if (dataUrl) {
          return [{
            image: dataUrl,
            width: pdfImageWidthPt(node, maxImageWidth),
            margin: [0, 8, 0, 12],
          }];
        }
        if (labels && labels.imagePlaceholder) {
          return [{ text: labels.imagePlaceholder, style: 'muted', italics: true }];
        }
        return [];
      });
    }

    if (tag === 'figcaption') {
      var cap = (node.textContent || '').trim();
      if (cap) {
        return Promise.resolve([{ text: cap, style: 'muted', margin: [0, 0, 0, 10], italics: true }]);
      }
      return Promise.resolve([]);
    }

    var chartHost = resolvePdfChartHost(node);
    if (chartHost && (chartHost.getAttribute('data-datadump-chart') || chartHost.querySelector('svg'))) {
      return chartHostToPdfBlocks(chartHost, labels);
    }

    if (
      tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main' ||
      tag === 'span' || tag === 'figure'
    ) {
      return processPdfNodesSequentially(Array.from(node.childNodes), labels, pdfOptions);
    }

    var fallback = (node.textContent || '').trim();
    if (fallback) {
      return Promise.resolve([{ text: fallback, style: 'body', margin: [0, 0, 0, 6] }]);
    }
    return Promise.resolve([]);
  }

  function pdfDomRootToBlocks(root, labels, pdfOptions) {
    if (!root) return Promise.resolve([]);
    return processPdfNodesSequentially(Array.from(root.childNodes), labels, pdfOptions);
  }

  function htmlToPdfBlocksAsync(html, labels, pdfOptions) {
    var wrap = document.createElement('div');
    wrap.innerHTML = String(html || '');
    return processPdfNodesSequentially(Array.from(wrap.childNodes), labels, pdfOptions);
  }

  function toDataUrl(src) {
    if (!src) return Promise.resolve(null);
    if (String(src).indexOf('data:') === 0) return Promise.resolve(src);

    return fetch(src, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('fetch failed');
        return res.blob();
      })
      .then(function (blob) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () {
            resolve(reader.result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      })
      .catch(function () {
        return null;
      });
  }

  function buildPdfContent(item, labels, pdfOptions) {
    pdfOptions = resolvePdfOptions(pdfOptions);
    var payload = item && item.payload;
    var content = [];

    function pdfFromHtml(html) {
      return htmlToPdfBlocksAsync(html, labels, pdfOptions).then(function (domBlocks) {
        if (domBlocks.length) {
          return domBlocks;
        }
        var tablesOnly = extractTablesFromHtml(html);
        var fallback = [];
        tablesOnly.forEach(function (table) {
          fallback.push(tableToPdfBlock(table, null, pdfOptions));
        });
        return fallback;
      });
    }

    if (item && item._pdfRoot) {
      return pdfDomRootToBlocks(item._pdfRoot, labels, pdfOptions).then(function (domBlocks) {
        if (domBlocks.length) return domBlocks;
        var htmlFallback = resolveItemHtmlForPdf(item);
        if (htmlFallback) return pdfFromHtml(htmlFallback);
        return [];
      });
    }

    if (!payload) {
      var htmlOnly = resolveItemHtmlForPdf(item);
      if (htmlOnly) {
        return pdfFromHtml(htmlOnly);
      }
      return Promise.resolve(content);
    }

    if (shouldBuildPdfFromHtml(item)) {
      var pdfHtml = resolveItemHtmlForPdf(item);
      if (pdfHtml) {
        return pdfFromHtml(pdfHtml);
      }
    }

    function addMarkdown(body) {
      markdownBlocksToPdf(stripPdfFollowUpPrompts(body), []).forEach(function (block) {
        content.push(block);
      });
    }

    if (payload.type === 'mixed' && Array.isArray(payload.parts)) {
      var chain = Promise.resolve();

      payload.parts.forEach(function (part) {
        chain = chain.then(function () {
          if (!part || !part.body) return null;

          if (part.type === 'image') {
            return toDataUrl(part.body).then(function (dataUrl) {
              if (dataUrl) {
                content.push({
                  image: dataUrl,
                  width: pdfOptions.maxImageWidth,
                  margin: [0, 8, 0, 12],
                });
              } else if (labels.imagePlaceholder) {
                content.push({ text: labels.imagePlaceholder, style: 'muted', italics: true });
              }
              return null;
            });
          }

          if (part.type === 'map') {
            content.push({
              text: labels.mapPlaceholder || 'Map (view in browser)',
              style: 'muted',
              italics: true,
              margin: [0, 6, 0, 12],
            });
            return null;
          }

          if (part.type === 'html') {
            return pdfFromHtml(part.body).then(function (htmlBlocks) {
              htmlBlocks.forEach(function (block) {
                content.push(block);
              });
              return null;
            });
          }

          addMarkdown(part.body);
          return null;
        });
      });

      return chain.then(function () {
        return content;
      });
    }

    if (payload.body) addMarkdown(payload.body);
    return Promise.resolve(content);
  }

  function formatPdfFooterDateTime(item, localeCode) {
    var d = null;
    if (item && item.createdAt) {
      d = new Date(item.createdAt);
      if (isNaN(d.getTime())) d = null;
    }
    if (!d && item && item.timeLabel) {
      return String(item.timeLabel);
    }
    if (!d) return '';
    try {
      return d.toLocaleString(localeCode, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch (_) {
      return item.timeLabel || '';
    }
  }

  function ensurePdfMake() {
    if (typeof pdfMake === 'undefined' || !pdfMake.createPdf) {
      throw new Error('pdfmake not loaded');
    }
  }

  function ensureXlsx() {
    if (typeof XLSX === 'undefined' || !XLSX.utils || !XLSX.writeFile) {
      throw new Error('xlsx not loaded');
    }
  }

  function safeSheetName(name, index) {
    var cleaned = String(name || 'Table ' + (index + 1))
      .replace(/[:\\/?*[\]]/g, '')
      .trim()
      .slice(0, 31);
    return cleaned || 'Sheet' + (index + 1);
  }

  function buildFilename(prefix, title, ext) {
    return slugFilename(prefix || 'export') + '-' + slugFilename(title) + '-' + dateStamp() + '.' + ext;
  }

  function parsePayloadJson(raw) {
    if (!raw || typeof raw !== 'string') return null;
    var trimmed = raw.trim();
    if (!trimmed || trimmed.charAt(0) !== '{') return null;
    try {
      return JSON.parse(trimmed);
    } catch (_) {
      return null;
    }
  }

  function buildItemFromElement(el, options) {
    options = options || {};
    if (!el) return null;

    var heading = el.querySelector('h1, h2, h3');
    var title = options.title
      || el.getAttribute('data-export-title')
      || (heading && heading.textContent.trim())
      || 'Export';

    var payload = options.payload || parsePayloadJson(options.payloadJson) || null;

    return {
      title: title,
      html: el.innerHTML,
      payload: payload,
      createdAt: options.createdAt || new Date().toISOString(),
    };
  }

  function enrichItemForPdf(item, targetEl) {
    if (!item || !targetEl) return item;

    var clone = targetEl.cloneNode(true);
    clone.querySelectorAll('.datadump-export-toolbar, [data-datadump-export-skip]').forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });

    var contentEl = clone.querySelector('[data-datadump-export-content]');
    item._pdfHtml = contentEl ? contentEl.innerHTML : clone.innerHTML;
    return item;
  }

  window.DATADUMP_EXPORT = {
    slugFilename: slugFilename,
    dateStamp: dateStamp,
    collectTablesFromItem: collectTablesFromItem,
    buildItemFromElement: buildItemFromElement,
    enrichItemForPdf: enrichItemForPdf,
    preparePdfStaging: preparePdfStaging,
    cleanupPdfStaging: cleanupPdfStaging,
    parsePayloadJson: parsePayloadJson,

    outputHasExportableTable: function (item) {
      return collectTablesFromItem(item).length > 0;
    },

    exportCsv: function (options) {
      var item = options && options.item;
      var labels = (options && options.labels) || {};
      var prefix = (options && options.filenamePrefix) || 'export';
      var tables = collectTablesFromItem(item);

      if (!tables.length) {
        throw new Error(labels.csvError || 'No table to export');
      }

      var title = slugFilename(item.title || 'table');
      var filename = buildFilename(prefix, title, 'csv');
      var blob = new Blob([tablesToCsv(tables)], { type: 'text/csv;charset=utf-8' });
      downloadBlob(blob, filename);
    },

    exportXlsx: function (options) {
      var item = options && options.item;
      var labels = (options && options.labels) || {};
      var prefix = (options && options.filenamePrefix) || 'export';
      var tables = collectTablesFromItem(item);

      if (!tables.length) {
        throw new Error(labels.excelError || labels.csvError || 'No table to export');
      }

      ensureXlsx();

      var title = slugFilename(item.title || 'table');
      var filename = buildFilename(prefix, title, 'xlsx');
      var workbook = XLSX.utils.book_new();

      tables.forEach(function (table, index) {
        var rows = (table.isSummary ? table.rows : [table.headers].concat(table.rows)).map(function (row) {
          return row.map(cellPlainText);
        });
        var sheet = XLSX.utils.aoa_to_sheet(rows);
        var sheetName = tables.length > 1 ? safeSheetName('Table ' + (index + 1), index) : safeSheetName(title, 0);
        XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
      });

      XLSX.writeFile(workbook, filename);
    },

    exportPdf: function (options) {
      var item = options && options.item;
      var labels = (options && options.labels) || {};
      var locale = (options && options.locale) || 'en-GB';
      var prefix = (options && options.filenamePrefix) || 'export';
      var showPdfFooterTimestamp = options.showPdfFooterTimestamp !== false;
      var pdfOptions = resolvePdfOptions(options);

      if (!item) {
        return Promise.reject(new Error(labels.pdfError || 'Nothing to export'));
      }

      ensurePdfMake();

      var title = item.title || 'Export';
      var footerDateTime = formatPdfFooterDateTime(item, locale);

      return buildPdfContent(item, labels, pdfOptions).then(function (bodyContent) {
        if (!bodyContent.length) {
          throw new Error(labels.pdfError || 'Nothing to export');
        }

        var doc = {
          pageSize: 'A4',
          pageOrientation: pdfOptions.pageOrientation,
          pageMargins: [48, 56, 48, 56],
          defaultStyle: {
            font: 'Roboto',
            fontSize: 10,
            lineHeight: 1.35,
          },
          styles: {
            title: { fontSize: 16, bold: true, margin: [0, 0, 0, 14] },
            h2: { fontSize: 12, bold: true, margin: [0, 10, 0, 4] },
            body: { fontSize: 10 },
            muted: { fontSize: 9, color: '#777777' },
            pdfIncomeCell: { color: PDF_INCOME_COLOR, bold: true },
            pdfExpenditureCell: { color: PDF_EXPENDITURE_COLOR, bold: true },
            pdfDisbursementCell: { color: PDF_DISBURSEMENT_COLOR, bold: true },
            pdfNegativeCell: { color: PDF_NEGATIVE_COLOR, bold: true },
          },
          content: [
            { text: title, style: 'title' },
          ],
          footer: function (currentPage, pageCount) {
            var footerStack = [];
            if (labels.footer) {
              footerStack.push({ text: labels.footer, style: 'muted' });
            }
            if (footerDateTime && showPdfFooterTimestamp) {
              footerStack.push({
                text: footerDateTime,
                style: 'muted',
                margin: [0, 2, 0, 0],
              });
            }
            return {
              columns: [
                { stack: footerStack.length ? footerStack : [{ text: ' ', style: 'muted' }], alignment: 'left' },
                { text: currentPage + ' / ' + pageCount, alignment: 'right', style: 'muted' },
              ],
              margin: [48, 0, 48, 24],
            };
          },
        };

        bodyContent.forEach(function (block) {
          doc.content.push(block);
        });

        var filename = buildFilename(prefix, title, 'pdf');
        try {
          pdfMake.createPdf(doc).download(filename);
        } catch (err) {
          throw new Error(labels.pdfError || 'PDF export failed');
        }
      }).finally(function () {
        cleanupPdfStaging(item);
      });
    },

    export: function (options) {
      var format = String((options && options.format) || '').toLowerCase();
      if (format === 'pdf') return this.exportPdf(options);
      if (format === 'csv') {
        this.exportCsv(options);
        return Promise.resolve();
      }
      if (format === 'xlsx' || format === 'excel') {
        this.exportXlsx(options);
        return Promise.resolve();
      }
      return Promise.reject(new Error('Unknown export format: ' + format));
    },
  };
})();
