/**
 * DataDump: shared PDF / CSV / Excel export engine (client-side).
 * Used by dmx-datadump-export and available as window.DATADUMP_EXPORT.
 */
(function () {
  'use strict';

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

  function extractTablesFromHtml(html) {
    var wrap = document.createElement('div');
    wrap.innerHTML = String(html || '');
    var tables = [];

    wrap.querySelectorAll('table').forEach(function (table) {
      var matrix = [];
      table.querySelectorAll('tr').forEach(function (tr) {
        var cells = [];
        tr.querySelectorAll('th, td').forEach(function (cell) {
          cells.push((cell.textContent || '').trim());
        });
        if (cells.length) matrix.push(cells);
      });
      if (matrix.length) {
        tables.push({ headers: matrix[0], rows: matrix.slice(1) });
      }
    });

    return tables;
  }

  function collectTextBodies(payload) {
    var chunks = [];
    if (!payload) return chunks;

    if (payload.type === 'mixed' && Array.isArray(payload.parts)) {
      payload.parts.forEach(function (part) {
        if (part && part.body && part.type !== 'image' && part.type !== 'map') {
          chunks.push(String(part.body));
        }
      });
      return chunks;
    }

    if (payload.type === 'markdown' && payload.body) {
      chunks.push(String(payload.body));
      return chunks;
    }

    if (payload.body) chunks.push(String(payload.body));
    return chunks;
  }

  function collectTablesFromItem(item) {
    var tables = [];
    var bodies = collectTextBodies(item && item.payload);

    bodies.forEach(function (body) {
      extractMarkdownTables(body).forEach(function (table) {
        tables.push(table);
      });
    });

    if (!tables.length && item && item.html) {
      tables = extractTablesFromHtml(item.html);
    }

    return tables;
  }

  function rowToCsv(cells) {
    return cells.map(function (cell) {
      var value = cell == null ? '' : String(cell);
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
      lines.push(rowToCsv(table.headers));
      table.rows.forEach(function (row) {
        lines.push(rowToCsv(row));
      });
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

  function tableToPdfBlock(table) {
    var colCount = table.headers.length || 1;
    var headers = table.headers.map(function (cell) {
      return stripInlineMarkdown(cell);
    });
    var rows = table.rows.map(function (row) {
      var cells = row.map(function (cell) {
        return stripInlineMarkdown(cell);
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
    return {
      table: {
        headerRows: 1,
        widths: widths,
        body: body,
      },
      layout: 'lightHorizontalLines',
      margin: [0, 6, 0, 12],
      style: 'body',
      fontSize: 8,
    };
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
    if (node.classList && node.classList.contains('datadump-export-toolbar')) return true;
    if (node.closest && node.closest('.datadump-export-toolbar')) return true;
    return false;
  }

  function processPdfNodesSequentially(nodes, labels) {
    return nodes.reduce(function (chain, node) {
      return chain.then(function (acc) {
        return processPdfNode(node, labels).then(function (blocks) {
          return acc.concat(blocks);
        });
      });
    }, Promise.resolve([]));
  }

  function processPdfNode(node, labels) {
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
      return Promise.resolve([{
        text: (node.textContent || '').trim(),
        style: tag === 'h1' ? 'title' : 'h2',
      }]);
    }

    if (tag === 'table') {
      var tableBlocks = [];
      extractTablesFromHtml(node.outerHTML).forEach(function (table) {
        tableBlocks.push(tableToPdfBlock(table));
      });
      return Promise.resolve(tableBlocks);
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
      if (pt) return Promise.resolve([{ text: pt, style: 'body', margin: [0, 0, 0, 6] }]);
      return Promise.resolve([]);
    }

    if (tag === 'img') {
      var src = node.getAttribute('src');
      return toDataUrl(src).then(function (dataUrl) {
        if (dataUrl) {
          return [{
            image: dataUrl,
            width: 420,
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

    if (
      tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main' ||
      tag === 'span' || tag === 'figure'
    ) {
      return processPdfNodesSequentially(Array.from(node.childNodes), labels);
    }

    var fallback = (node.textContent || '').trim();
    if (fallback) {
      return Promise.resolve([{ text: fallback, style: 'body', margin: [0, 0, 0, 6] }]);
    }
    return Promise.resolve([]);
  }

  function htmlToPdfBlocksAsync(html, labels) {
    var wrap = document.createElement('div');
    wrap.innerHTML = String(html || '');
    return processPdfNodesSequentially(Array.from(wrap.childNodes), labels);
  }

  function htmlToPdfBlocks(html) {
    var content = [];
    var wrap = document.createElement('div');
    wrap.innerHTML = String(html || '');

    function walk(node) {
      if (shouldSkipDomNode(node)) return;

      if (node.nodeType === 3) {
        var t = node.textContent.replace(/\s+/g, ' ').trim();
        if (t) content.push({ text: t, style: 'body', margin: [0, 0, 0, 6] });
        return;
      }

      if (node.nodeType !== 1) return;

      var tag = node.tagName.toLowerCase();

      if (/^h[1-6]$/.test(tag)) {
        content.push({
          text: (node.textContent || '').trim(),
          style: tag === 'h1' ? 'title' : 'h2',
        });
        return;
      }

      if (tag === 'table') {
        extractTablesFromHtml(node.outerHTML).forEach(function (table) {
          content.push(tableToPdfBlock(table));
        });
        return;
      }

      if (tag === 'ul') {
        var ulItems = [];
        node.querySelectorAll(':scope > li').forEach(function (li) {
          var liText = (li.textContent || '').trim();
          if (liText) ulItems.push(liText);
        });
        if (ulItems.length) {
          content.push({ ul: ulItems, margin: [0, 4, 0, 8], style: 'body' });
        }
        return;
      }

      if (tag === 'ol') {
        var olItems = [];
        node.querySelectorAll(':scope > li').forEach(function (li) {
          var liText = (li.textContent || '').trim();
          if (liText) olItems.push(liText);
        });
        if (olItems.length) {
          content.push({ ol: olItems, margin: [0, 4, 0, 8], style: 'body' });
        }
        return;
      }

      if (tag === 'p' || tag === 'blockquote' || tag === 'pre') {
        var pt = (node.textContent || '').trim();
        if (pt) content.push({ text: pt, style: 'body', margin: [0, 0, 0, 6] });
        return;
      }

      if (tag === 'img') {
        return;
      }

      if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main' || tag === 'span') {
        Array.from(node.childNodes).forEach(walk);
        return;
      }

      var fallback = (node.textContent || '').trim();
      if (fallback) content.push({ text: fallback, style: 'body', margin: [0, 0, 0, 6] });
    }

    Array.from(wrap.childNodes).forEach(walk);
    return content;
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

  function buildPdfContent(item, labels) {
    var payload = item && item.payload;
    var content = [];

    if (!payload) {
      if (item && item.html) {
        return htmlToPdfBlocksAsync(item.html, labels).then(function (domBlocks) {
          if (domBlocks.length) {
            return domBlocks;
          }
          var tablesOnly = extractTablesFromHtml(item.html);
          var fallback = [];
          tablesOnly.forEach(function (table) {
            fallback.push(tableToPdfBlock(table));
          });
          return fallback;
        });
      }
      return Promise.resolve(content);
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
                  width: 420,
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

  window.DATADUMP_EXPORT = {
    slugFilename: slugFilename,
    dateStamp: dateStamp,
    collectTablesFromItem: collectTablesFromItem,
    buildItemFromElement: buildItemFromElement,
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
        var rows = [table.headers].concat(table.rows);
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

      if (!item) {
        return Promise.reject(new Error(labels.pdfError || 'Nothing to export'));
      }

      ensurePdfMake();

      var title = item.title || 'Export';
      var footerDateTime = formatPdfFooterDateTime(item, locale);

      return buildPdfContent(item, labels).then(function (bodyContent) {
        if (!bodyContent.length) {
          throw new Error(labels.pdfError || 'Nothing to export');
        }

        var doc = {
          pageSize: 'A4',
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
