/**
 * DataDump Export: App Connect toolbar (PDF / CSV / Excel).
 */
dmx.Component('datadump-export', {
  initialData: {
    loading: false,
    lastFormat: '',
    error: '',
  },

  attributes: {
    targetSelector: { type: String, default: '' },
    showPdf: { type: Boolean, default: true },
    showCsv: { type: Boolean, default: true },
    showExcel: { type: Boolean, default: true },
    filenamePrefix: { type: String, default: 'export' },
    exportTitle: { type: String, default: '' },
    payloadJson: { type: String, default: '' },
    pdfFooter: { type: String, default: '' },
    showPdfFooterTimestamp: { type: Boolean, default: true },
    pdfOrientation: { type: String, default: 'portrait' },
    pdfMaxImageWidth: { type: Number, default: 420 },
    pdfExportCss: { type: String, default: '' },
    pdfUseComputedStyles: { type: Boolean, default: true },
    pdfPageBackground: { type: String, default: '#ffffff' },
    locale: { type: String, default: 'en-GB' },
    pdfLabel: { type: String, default: 'Export PDF' },
    csvLabel: { type: String, default: 'Export CSV' },
    excelLabel: { type: String, default: 'Export Excel' },
    pdfError: { type: String, default: 'Could not export PDF.' },
    csvError: { type: String, default: 'No table found to export as CSV.' },
    excelError: { type: String, default: 'No table found to export as Excel.' },
    mapPlaceholder: { type: String, default: 'Map (view in browser)' },
    imagePlaceholder: { type: String, default: 'Image unavailable' },
    toolbarClass: { type: String, default: 'datadump-export-toolbar' },
    buttonClass: { type: String, default: 'datadump-export-btn' },
    pdfmakeUrl: {
      type: String,
      default: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js',
    },
    vfsFontsUrl: {
      type: String,
      default: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.min.js',
    },
    xlsxUrl: {
      type: String,
      default: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    },
    designLabel: { type: String, default: 'DataDump export' },
  },

  events: {
    pdfDone: Event,
    csvDone: Event,
    excelDone: Event,
    error: Event,
  },

  methods: {
    exportPdf() {
      return this._export('pdf');
    },
    exportCsv() {
      return this._export('csv');
    },
    exportExcel() {
      return this._export('xlsx');
    },
    refresh() {
      this._renderToolbar();
    },
  },

  init(node) {
    this._node = node;
    this._toolbar = node.querySelector('.datadump-export-toolbar');
    if (!this._toolbar) {
      this._toolbar = document.createElement('div');
      this._toolbar.className = 'datadump-export-toolbar';
      this._toolbar.setAttribute('role', 'toolbar');
      node.appendChild(this._toolbar);
    }
    this._scriptPromises = {};
    this._renderToolbar();
  },

  performUpdate() {
    this._renderToolbar();
  },

  destroy() {
    this._toolbar = null;
    this._node = null;
  },

  _readLabel(htmlAttr, propName, fallback) {
    var node = this._node;
    if (!node) return fallback;

    var staticVal = node.getAttribute(htmlAttr);
    if (staticVal != null && staticVal !== '' && staticVal.indexOf('.') === -1) {
      return staticVal;
    }

    var bindAttr = 'dmx-bind:' + htmlAttr;
    if (node.hasAttribute(bindAttr)) {
      try {
        var parsed = dmx.parse(node.getAttribute(bindAttr));
        if (parsed != null && parsed !== '') return String(parsed);
      } catch (_) {}
    }

    var propVal = this.props[propName];
    if (propVal != null && propVal !== '') return String(propVal);
    return fallback;
  },

  _isTruthyProp(propName, htmlAttr) {
    var node = this._node;
    if (node && node.hasAttribute(htmlAttr)) {
      var raw = node.getAttribute(htmlAttr);
      if (raw === 'false' || raw === '0') return false;
      return true;
    }
    return this.props[propName] !== false;
  },

  _renderToolbar() {
    if (!this._toolbar) return;

    var showPdf = this._isTruthyProp('showPdf', 'show-pdf');
    var showCsv = this._isTruthyProp('showCsv', 'show-csv');
    var showExcel = this._isTruthyProp('showExcel', 'show-excel');
    var btnClass = this._readLabel('button-class', 'buttonClass', 'datadump-export-btn');
    var self = this;

    this._toolbar.className = this._readLabel('toolbar-class', 'toolbarClass', 'datadump-export-toolbar');
    this._toolbar.setAttribute('aria-label', this._readLabel('design-label', 'designLabel', 'Export'));
    this._toolbar.innerHTML = '';

    if (!showPdf && !showCsv && !showExcel) {
      var empty = document.createElement('span');
      empty.className = 'datadump-export-empty';
      empty.textContent = 'Enable PDF, CSV, or Excel in component properties.';
      this._toolbar.appendChild(empty);
      return;
    }

    function addBtn(format, iconClass, labelAttr, labelProp, fallbackLabel, extraClass) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = btnClass + ' ' + extraClass;
      btn.setAttribute('data-datadump-format', format);
      btn.setAttribute('title', self._readLabel(labelAttr, labelProp, fallbackLabel));
      btn.setAttribute('aria-label', btn.getAttribute('title'));

      var icon = document.createElement('i');
      icon.className = iconClass;
      icon.setAttribute('aria-hidden', 'true');
      btn.appendChild(icon);

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        self._export(format);
      });

      self._toolbar.appendChild(btn);
    }

    if (showPdf) {
      addBtn('pdf', 'fas fa-file-pdf', 'pdf-label', 'pdfLabel', 'Export PDF', 'datadump-export-btn--pdf');
    }
    if (showCsv) {
      addBtn('csv', 'fas fa-file-csv', 'csv-label', 'csvLabel', 'Export CSV', 'datadump-export-btn--csv');
    }
    if (showExcel) {
      addBtn('xlsx', 'fas fa-file-excel', 'excel-label', 'excelLabel', 'Export Excel', 'datadump-export-btn--excel');
    }
  },

  _loadScript(key, url) {
    if (!url) return Promise.reject(new Error('Script URL missing'));
    if (this._scriptPromises[key]) return this._scriptPromises[key];

    if (key === 'pdfmake' && typeof pdfMake !== 'undefined' && pdfMake.createPdf) {
      return Promise.resolve();
    }
    if (key === 'xlsx' && typeof XLSX !== 'undefined' && XLSX.writeFile) {
      return Promise.resolve();
    }

    this._scriptPromises[key] = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = function () {
        resolve();
      };
      script.onerror = function () {
        reject(new Error('Failed to load ' + url));
      };
      document.head.appendChild(script);
    });

    return this._scriptPromises[key];
  },

  _ensurePdfLibs() {
    var self = this;
    return this._loadScript('pdfmake', this.props.pdfmakeUrl).then(function () {
      return self._loadScript('vfs', self.props.vfsFontsUrl);
    });
  },

  _ensureXlsxLib() {
    return this._loadScript('xlsx', this.props.xlsxUrl);
  },

  _resolveTarget() {
    var selector = this._readLabel('target-selector', 'targetSelector', '');
    if (!selector) {
      throw new Error('Set Target selector to the section you want to export (e.g. #myReport).');
    }
    var el = document.querySelector(selector);
    if (!el) {
      throw new Error('Export target not found: ' + selector);
    }
    return el;
  },

  _buildLabels() {
    return {
      footer: this._readLabel('pdf-footer', 'pdfFooter', ''),
      pdfError: this._readLabel('pdf-error', 'pdfError', 'Could not export PDF.'),
      csvError: this._readLabel('csv-error', 'csvError', 'No table found to export as CSV.'),
      excelError: this._readLabel('excel-error', 'excelError', 'No table found to export as Excel.'),
      mapPlaceholder: this._readLabel('map-placeholder', 'mapPlaceholder', 'Map (view in browser)'),
      imagePlaceholder: this._readLabel('image-placeholder', 'imagePlaceholder', 'Image unavailable'),
    };
  },

  _buildItem(targetEl) {
    if (!window.DATADUMP_EXPORT || !DATADUMP_EXPORT.buildItemFromElement) {
      throw new Error('DataDump shared library not loaded.');
    }

    var payloadJson = this._readLabel('payload-json', 'payloadJson', '');
    return DATADUMP_EXPORT.buildItemFromElement(targetEl, {
      title: this._readLabel('export-title', 'exportTitle', ''),
      payloadJson: payloadJson,
    });
  },

  _setError(message) {
    this.data.error = message || '';
    this.data.loading = false;
    this.dispatchEvent('error', null, { detail: { message: this.data.error } });
  },

  _export(format) {
    var self = this;
    var engine = window.DATADUMP_EXPORT;
    if (!engine) {
      this._setError('DataDump shared library not loaded.');
      return Promise.reject(new Error(this.data.error));
    }

    this.data.loading = true;
    this.data.error = '';
    this.data.lastFormat = format;

    var labels = this._buildLabels();
    var locale = this._readLabel('locale', 'locale', 'en-GB');
    var filenamePrefix = this._readLabel('filename-prefix', 'filenamePrefix', 'export');

    var run = function () {
      var targetEl = self._resolveTarget();
      var item = self._buildItem(targetEl);
      if (format === 'pdf' && engine.preparePdfStaging) {
        engine.preparePdfStaging(item, targetEl, {
          pageOrientation: self._readLabel('pdf-orientation', 'pdfOrientation', 'portrait'),
          pdfMaxImageWidth: parseInt(self._readLabel('pdf-max-image-width', 'pdfMaxImageWidth', '420'), 10) || 420,
          pdfExportCss: self._readLabel('pdf-export-css', 'pdfExportCss', ''),
          pdfUseComputedStyles: self._isTruthyProp('pdfUseComputedStyles', 'pdf-use-computed-styles'),
          pdfPageBackground: self._readLabel('pdf-page-background', 'pdfPageBackground', '#ffffff'),
        });
      } else if (format === 'pdf' && engine.enrichItemForPdf) {
        engine.enrichItemForPdf(item, targetEl);
      }
      var options = {
        item: item,
        labels: labels,
        locale: locale,
        filenamePrefix: filenamePrefix,
        showPdfFooterTimestamp: self._isTruthyProp('showPdfFooterTimestamp', 'show-pdf-footer-timestamp'),
        pageOrientation: self._readLabel('pdf-orientation', 'pdfOrientation', 'portrait'),
        pdfMaxImageWidth: parseInt(self._readLabel('pdf-max-image-width', 'pdfMaxImageWidth', '420'), 10) || 420,
        pdfExportCss: self._readLabel('pdf-export-css', 'pdfExportCss', ''),
        pdfUseComputedStyles: self._isTruthyProp('pdfUseComputedStyles', 'pdf-use-computed-styles'),
        pdfPageBackground: self._readLabel('pdf-page-background', 'pdfPageBackground', '#ffffff'),
      };

      if (format === 'pdf') {
        return engine.exportPdf(options).then(function () {
          self.data.loading = false;
          self.dispatchEvent('pdfDone', null, { detail: { format: 'pdf', title: item.title } });
        });
      }

      if (format === 'csv') {
        engine.exportCsv(options);
        self.data.loading = false;
        self.dispatchEvent('csvDone', null, { detail: { format: 'csv', title: item.title } });
        return Promise.resolve();
      }

      if (format === 'xlsx') {
        engine.exportXlsx(options);
        self.data.loading = false;
        self.dispatchEvent('excelDone', null, { detail: { format: 'xlsx', title: item.title } });
        return Promise.resolve();
      }

      return Promise.reject(new Error('Unknown format'));
    };

    var chain = Promise.resolve();

    if (format === 'pdf') {
      chain = this._ensurePdfLibs();
    } else if (format === 'xlsx') {
      chain = this._ensureXlsxLib();
    }

    return chain
      .then(run)
      .catch(function (err) {
        var message = (err && err.message) || labels.pdfError;
        if (format === 'csv') message = (err && err.message) || labels.csvError;
        if (format === 'xlsx') message = (err && err.message) || labels.excelError;
        self._setError(message);
        return Promise.reject(err);
      });
  },
});
