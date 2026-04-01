(function () {

  /* ── CONFIG ──────────────────────────────────────────────────────────── */
  var NS                           = '[IDS:debug]';
  var IDS_DEBUG_DOWNLOAD_FIELD_HTML_ID = 'ticket-field-56000178117';
  var IDS_DEBUG_DOWNLOAD_FIELD_ID      = '56000178117';
  var IDS_DEBUG_DOWNLOAD_DELAY_MS      = 5000;
  /* Run only for this portal v2 logged-in user email. Keep '' to allow all users. */
  

  /* ── STATE ───────────────────────────────────────────────────────────── */
  var logBuffer          = [];
  var logSeq             = 0;
  var opSeq              = 0;
  var _autoDownTimer     = null;
  var _workspaceChanged  = false;
  var _workspaceRebindTimer = null;
  var _afterWorkspaceAttachSeen = false;

  /* ── UTILITIES ───────────────────────────────────────────────────────── */

  function trimOrEmpty(s) {
    return (s == null || s === '') ? '' : String(s).trim();
  }

  function ts() {
    return new Date().toISOString();
  }

  function nextOpId() {
    return ++opSeq;
  }

  function formatLogLine(args) {
    var parts = [];
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a === undefined)       parts.push('undefined');
      else if (a === null)       parts.push('null');
      else if (typeof a === 'object') {
        try   { parts.push(JSON.stringify(a)); }
        catch (e) { parts.push(String(a)); }
      } else {
        parts.push(String(a));
      }
    }
    return parts.join(' ');
  }

  function log() {
    var args = Array.prototype.slice.call(arguments);
    var line = '[' + (++logSeq) + '] ' + ts() + ' ' + NS + ' ' + formatLogLine(args);
    logBuffer.push(line);
    console.log.apply(console, [ts(), NS].concat(args));
  }

  function sep(label) {
    var bar = '════════════════════════════════════════════════════════════════════════════════';
    var header = '  ▶  ' + label + '   @ ' + ts();
    logBuffer.push('');
    logBuffer.push(bar);
    logBuffer.push(header);
    logBuffer.push(bar);
    console.log(bar + '\n' + header + '\n' + bar);
  }

  /* ── AUTO-DOWNLOAD ───────────────────────────────────────────────────── */

  function hasDownloadTarget() {
    return !!(trimOrEmpty(IDS_DEBUG_DOWNLOAD_FIELD_HTML_ID) || trimOrEmpty(IDS_DEBUG_DOWNLOAD_FIELD_ID));
  }

  function matchesIdsDownloadTarget(el) {
    if (!el || el.nodeType !== 1) return false;
    var hid = trimOrEmpty(IDS_DEBUG_DOWNLOAD_FIELD_HTML_ID);
    var fid = trimOrEmpty(IDS_DEBUG_DOWNLOAD_FIELD_ID);
    if (hid && el.id === hid) return true;
    if (fid) {
      var wrap = el.closest('[data-field-id]');
      if (wrap && String(wrap.getAttribute('data-field-id')) === fid) return true;
    }
    return false;
  }

  function scheduleAutoDownloadDelayed(reason) {
    if (_autoDownTimer) clearTimeout(_autoDownTimer);
    _autoDownTimer = setTimeout(function () {
      _autoDownTimer = null;
      log('auto-download (no target): firing after', IDS_DEBUG_DOWNLOAD_DELAY_MS, 'ms', reason);
      downloadIdsLogFile(reason);
    }, IDS_DEBUG_DOWNLOAD_DELAY_MS);
  }

  function downloadIdsLogFileIfTargetField(reason, el) {
    if (hasDownloadTarget()) {
      if (matchesIdsDownloadTarget(el)) downloadIdsLogFile(reason);
    } else {
      scheduleAutoDownloadDelayed(reason);
    }
  }

  function downloadIdsLogFile(reason) {
    reason = reason || 'download';
    var body = logBuffer.join('\n');
    var name = 'ids-debug-' + ts().replace(/[:.]/g, '-') + '-' + reason + '.log';
    try {
      var blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href = url; a.download = name; a.style.display = 'none';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    } catch (e) {
      console.error(ts(), NS, 'downloadIdsLogFile failed', e);
    }
  }

  /* ── ENVIRONMENT ─────────────────────────────────────────────────────── */

  function getEnvironmentSummary() {
    return {
      userAgent:           navigator.userAgent,
      platform:            navigator.platform,
      vendor:              navigator.vendor,
      language:            navigator.language,
      languages:           navigator.languages ? [].concat(navigator.languages) : undefined,
      cookieEnabled:       navigator.cookieEnabled,
      hardwareConcurrency: navigator.hardwareConcurrency,
      maxTouchPoints:      navigator.maxTouchPoints,
      onLine:              navigator.onLine,
      screen: {
        width:      screen.width,
        height:     screen.height,
        availWidth: screen.availWidth,
        availHeight:screen.availHeight,
        colorDepth: screen.colorDepth
      },
      viewport:         { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      timezone: (function () {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return null; }
      })(),
      documentVisibility: document.visibilityState,
      documentReadyState: document.readyState
    };
  }

  /* ── FORM SNAPSHOT ───────────────────────────────────────────────────── */

  function snapshotFormElements(root, label) {
    root = root ||
      document.querySelector('#new-ticket-form') ||
      document.querySelector('form') ||
      document.body;
    if (!root || !root.querySelectorAll) {
      log('snapshotFormElements: no root for', label);
      return [];
    }

    var els = root.querySelectorAll('input, select, textarea, button');
    var out = [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
      var v  = el.value;
      if (v && v.length > 120) v = v.slice(0, 120) + '…';
      out.push({
        tag:          el.tagName,
        name:         el.name  || '',
        id:           el.id    || '',
        type:         el.type  || '',
        dataFieldId:  el.getAttribute('data-field-id'),
        dataFieldName:el.getAttribute('data-field-name'),
        value:        v,
        disabled:     el.disabled,
        readOnly:     el.readOnly,
        hiddenAttr:   el.hidden,
        ariaHidden:   el.getAttribute('aria-hidden'),
        display:      cs ? cs.display    : '',
        visibility:   cs ? cs.visibility : '',
        inDocument:   document.contains(el),
        powerSelectId:el.getAttribute('data-power-select-id')
      });
    }

    log('snapshotFormElements', label || '', 'count=', out.length);

    // Write per-field rows into logBuffer so they appear in the downloaded file
    out.forEach(function (e) {
      var vis  = (e.display === 'none' || e.visibility === 'hidden') ? 'HIDDEN' : 'visible';
      var line = '  | ' + e.tag +
        '  name=' + (e.name || e.id || '(no name)') +
        (e.dataFieldId ? '  fid=' + e.dataFieldId : '') +
        (e.value       ? '  value="' + e.value + '"' : '') +
        '  ' + vis;
      logBuffer.push(line);
    });
    logBuffer.push('');

    // Sortable grid in DevTools
    console.table(out);

    return out;
  }

  /* ── SECTION MAP HELPERS ─────────────────────────────────────────────── */

  function sectionMapSignature(map) {
    if (!map) return '';
    try { return JSON.stringify(map); }
    catch (e) {
      try {
        return Object.keys(map).sort().map(function (k) {
          return k + ':' + JSON.stringify(map[k]);
        }).join('|');
      } catch (e2) { return String(map); }
    }
  }

  function logSectionMapDetailed(map, reason) {
    var parentIds = Object.keys(map);
    log('sectionMap changed (' + reason + ') — ' + parentIds.length + ' parent field(s)');
    parentIds.forEach(function (parentId) {
      var valueMap = map[parentId];
      var valueIds = Object.keys(valueMap);
      log('  parent ' + parentId + ' — ' + valueIds.length + ' value mapping(s)');
      valueIds.forEach(function (valId) {
        var fields = valueMap[valId];
        if (!fields || fields.length === 0) {
          log('    value ' + valId + ' → 0 child fields');
          return;
        }
        log('    value ' + valId + ' → ' + fields.length + ' child field(s)');
        fields.forEach(function (f, i) {
          log(
            '      field[' + i + ']',
            'id='              + f.id,
            'name='            + f.name,
            'label="'          + f.label + '"',
            'type='            + f.field_type,
            'dom_type='        + f.dom_type,
            'ws='              + f.workspace_id,
            'pos='             + f.position,
            'state='           + f.state,
            'required='        + f.required,
            'required_closure='+ f.required_for_closure,
            'required_portal=' + f.required_in_portal,
            'visible_portal='  + f.visible_in_portal,
            'editable_portal=' + f.editable_in_portal,
            'flexifield_def='  + f.flexifield_def_entry_id,
            'mini_para='       + f.mini_para_field
          );
          if (f.choices && f.choices.length) {
            log('        choices: ' + JSON.stringify(f.choices));
          }
          if (f.field_options && Object.keys(f.field_options).length) {
            var fo = f.field_options;
            var foLine = '        field_options:';
            if (fo.data_source !== undefined) foLine += ' data_source=' + fo.data_source;
            if (fo.bo_id       !== undefined) foLine += ' bo_id='       + fo.bo_id;
            if (fo.section     !== undefined) foLine += ' section='     + fo.section;
            if (fo.section_present !== undefined) foLine += ' section_present=' + fo.section_present;
            if (fo.conditions  && fo.conditions.length)  foLine += ' conditions=' + JSON.stringify(fo.conditions);
            if (fo.meta)        foLine += ' meta='        + JSON.stringify(fo.meta);
            log(foLine);
          }
          if (f.nested_ticket_fields && f.nested_ticket_fields.length) {
            log('        nested_ticket_fields: ' + JSON.stringify(f.nested_ticket_fields));
          }
        });
      });
    });
  }

  function maybeLogSectionMap(ctx, reason) {
    var sig = sectionMapSignature(ctx.sectionMap);
    if (!ctx.__idsSectionMapSig) ctx.__idsSectionMapSig = '';
    if (sig === ctx.__idsSectionMapSig) return false;
    ctx.__idsSectionMapSig = sig;
    logSectionMapDetailed(ctx.sectionMap, reason);
    return true;
  }

  /* ── DYNAMIC PARENT ID TRACKING ──────────────────────────────────────── */

  function rememberSectionParentIds(ctx) {
    window.__idsDynamicParentIds = window.__idsDynamicParentIds || {};
    try {
      for (var k in ctx.sectionMap) {
        if (ctx.sectionMap.hasOwnProperty(k)) window.__idsDynamicParentIds[k] = true;
      }
    } catch (e) {}
  }

  function isLikelyDynamicParentSelect(el) {
    if (!el || el.tagName !== 'SELECT') return false;
    var wrap = el.closest('[data-field-id]');
    if (!wrap) return false;
    return Boolean(window.__idsDynamicParentIds && window.__idsDynamicParentIds[wrap.getAttribute('data-field-id')]);
  }

  /* ── POWERSELECT PATCH ───────────────────────────────────────────────── */

  function patchPowerSelectPrototype() {
    if (typeof window.PowerSelect === 'undefined' || PowerSelect.prototype.__idsSendChangePatched) return;
    PowerSelect.prototype.__idsSendChangePatched = true;
    var orig = PowerSelect.prototype.sendChange;
    PowerSelect.prototype.sendChange = function (detail) {
      var oid         = nextOpId();
      var el          = this.config && this.config.el;
      var fid         = el && el.closest('[data-field-id]')
        ? el.closest('[data-field-id]').getAttribute('data-field-id') : null;
      var isDynParent = el ? isLikelyDynamicParentSelect(el) : false;
      sep('POWERSELECT CHANGE — field=' + (fid || 'unknown') + '  name=' + (el && el.name || '?'));
      log(
        'PowerSelect.sendChange',
        'op=',            oid,
        'powerSelectId=', this.elementId,
        'select#',        el && el.id,
        'name=',          el && el.name,
        'data-field-id=', fid,
        'value=',         el && el.value,
        'isDynamicParent=', isDynParent,
        'isRemote=',      this.isRemote,
        'isMultiselect=', this.isMultiselect,
        'isMultiple=',    this.isMultiple
      );
      var result = orig.apply(this, arguments);
      if (el && matchesIdsDownloadTarget(el)) {
        snapshotFormElements(
          document.querySelector('#new-ticket-fields') || document.body,
          'target field change — form snapshot'
        );
        downloadIdsLogFileIfTargetField('powerselect-sendChange', el);
      }
      return result;
    };
    log('patched PowerSelect.prototype.sendChange');
  }

  /* ── WORKSPACE SELECT LOGGER ─────────────────────────────────────────── */

  function installWorkspaceSelectLogger() {
    if (window.__idsWorkspaceLoggerInstalled) return;
    window.__idsWorkspaceLoggerInstalled = true;
    document.addEventListener('change', function (ev) {
      var t       = ev.target;
      if (!t.matches('select[name="helpdesk_ticket[workspace_id]"]')) return;
      var oid     = nextOpId();
      var wsValue = t.value;
      _workspaceChanged = true;
      _afterWorkspaceAttachSeen = false;
      if (_workspaceRebindTimer) {
        clearTimeout(_workspaceRebindTimer);
        _workspaceRebindTimer = null;
      }

      sep('WORKSPACE CHANGE — value=' + wsValue + '  op=' + oid);
      log('workspace select change (capture)', 'op=', oid, 'value=', wsValue);

      snapshotFormElements(
        document.querySelector('#new-ticket-form') || document.body,
        'after workspace change'
      );

      log('workspace render: renderWorkspaceSpecificFields will GET ticket.new — DOM fields will clear/rebuild');
      log('workspace render: next attachParentEvent should re-bind parentIds=',
          JSON.stringify(Object.keys(window.__idsDynamicParentIds || {})));

      // Workspace rebuild is async; force a re-bind after rebuild settles.
      _workspaceRebindTimer = setTimeout(function () {
        _workspaceRebindTimer = null;
        if (_afterWorkspaceAttachSeen) {
          log('workspace rebind: skipped forced attachParentEvent (already attached after workspace change)');
          return;
        }
        var ctx = window.CURR_ROUTE_FUNC_CONTEXT;
        var sections = ctx && ctx.sections;
        if (sections && typeof sections.attachParentEvent === 'function') {
          sep('WORKSPACE REBIND — force attachParentEvent after rebuild');
          log('workspace rebind: invoking CURR_ROUTE_FUNC_CONTEXT.sections.attachParentEvent()');
          try {
            sections.attachParentEvent();
          } catch (e) {
            log('FAIL: forced attachParentEvent threw', String(e));
          }
        } else {
          log('workspace rebind: sections instance not ready yet (skip)');
        }
      }, 1200);
    }, true);
    log('installed workspace select change logger (capture)');
  }

  /* ── PROTOTYPE PATCH ─────────────────────────────────────────────────── */

  function patchIncidentPrototypes() {
    if (typeof window.incidentDynamicSections === 'undefined') {
      console.warn(ts(), NS, 'incidentDynamicSections not on window; patch skipped');
      return;
    }

    incidentDynamicSections.prototype.attachParentEvent = function () {
      var isAfterWorkspace = _workspaceChanged;
      if (isAfterWorkspace && !_afterWorkspaceAttachSeen) {
        _afterWorkspaceAttachSeen = true;
        if (_workspaceRebindTimer) {
          clearTimeout(_workspaceRebindTimer);
          _workspaceRebindTimer = null;
        }
        // Mark this "after workspace" bind as consumed.
        _workspaceChanged = false;
      }
      var oid       = nextOpId();
      var wsContext = isAfterWorkspace ? 'AFTER WORKSPACE CHANGE' : 'BEFORE WORKSPACE CHANGE';
      sep('ATTACH PARENT EVENT (' + wsContext + ') — op=' + oid);
      log('attachParentEvent start', 'op=', oid, '(' + wsContext + ')');
      maybeLogSectionMap(this, 'attachParentEvent');
      rememberSectionParentIds(this);

      if (!this.__idsShowRelatedChildHandler) {
        this.__idsShowRelatedChildHandler = this.showRelatedChild.bind(this);
      }
      this.showRealtedChildHandler = this.__idsShowRelatedChildHandler;
      for (var parentId in this.sectionMap) {
        if (!this.sectionMap.hasOwnProperty(parentId)) continue;

        var parent     = this.container.querySelector('[data-field-id="' + parentId + '"] select');
        var displayVal = this.container.querySelector('[data-field-id="' + parentId + '"] .display-val');

        var displayValText = displayVal
          ? (displayVal.textContent || '').trim() || '(empty)'
          : 'none';

        log(
          'attachParentEvent parentId=', parentId,
          'select exists=', !!parent,
          'displayVal=', displayValText
        );

        if (!parent && !displayVal) {
          log('WARN: parent select and display-val both missing for parentId=', parentId,
              '— dynamic section cannot bind or run for this parent');
          var fieldWrap = this.container.querySelector('[data-field-id="' + parentId + '"]');
          if (fieldWrap) {
            log('  parent wrapper [data-field-id="' + parentId + '"] EXISTS but has no <select>;',
                'children in wrapper:', fieldWrap.children.length,
                'classes:', fieldWrap.className);
          } else {
            log('  parent wrapper [data-field-id="' + parentId + '"] is MISSING from container entirely —',
                'DOM may not have rendered this field yet or workspace rebuild cleared it');
          }
        }

        this.renderSectionContainer(parentId);

        if (parent) {
          if (!document.contains(parent)) {
            log('WARN: addEventListener skipped — select not in document', 'parentId=', parentId);
          } else {
            // attachParentEvent can run multiple times (especially after workspace rebuild).
            // Ensure only one capture listener is active per select.
            parent.removeEventListener('change', this.showRealtedChildHandler, true);
            parent.addEventListener('change', this.showRealtedChildHandler, true);
            log('bound change (capture) on select', 'parentId=', parentId, 'op=', oid);
          }
          if (this.isEdit) {
            parent.setAttribute('data-val', parent.value);
            this.showRelatedChild({ currentTarget: parent });
          }
        } else if (this.isEdit && displayVal && displayVal.getAttribute('data-val')) {
          this.showRealtedChildHandler({ currentTarget: displayVal, displayOnly: true });
        }
      }
      log('attachParentEvent end', 'op=', oid);
    };

    incidentDynamicSections.prototype.showRelatedChild = function (ev) {
      var oid  = nextOpId();
      var self = this;
      maybeLogSectionMap(this, 'showRelatedChild');

      sep('SHOW RELATED CHILD — op=' + oid);
      log('showRelatedChild EXECUTE', 'op=', oid, 'type=', ev && ev.type);

      var parent = ev.currentTarget;
      var wrap   = parent.closest('[data-field-id]');
      if (!wrap) {
        log('ERROR: parent has no [data-field-id] ancestor — cannot resolve parentId');
        downloadIdsLogFileIfTargetField('error-no-data-field-id', parent);
        return;
      }

      var parentId = parseInt(wrap.getAttribute('data-field-id'), 10);

      // FAILURE 1: valId resolution — option element may be missing
      var valId;
      try {
        valId = ev.displayOnly
          ? parent.getAttribute('data-val')
          : parseInt(
              parent.querySelector('option[value="' + parent.value + '"]').getAttribute('data-option-id'),
              10
            );
      } catch (e) {
        log('FAIL: could not resolve valId for parentId=', parentId,
            '— no <option value="' + parent.value + '"> found in select;',
            'selectedValue=', parent.value,
            'error=', String(e));
        downloadIdsLogFile('fail-valId-resolution');
        return;
      }

      var sectionFields    = this.sectionMap[parentId] && this.sectionMap[parentId][valId];
      var sectionContainer = this.container.querySelector(
        '.dynamic-section-container[data-parent="' + parentId + '"]'
      );

      log('onEvent execute:',
          'parentId=',      parentId,
          'valId=',         valId,
          'selectedValue=', parent.value,
          'eventType=',     ev.type || '(synthetic)',
          'sectionFields=', sectionFields ? sectionFields.length : 0,
          'container=',     sectionContainer
            ? '[data-parent="' + parentId + '"] class="' + sectionContainer.className + '" childCount=' + sectionContainer.childElementCount
            : 'MISSING'
      );

      if (!sectionContainer) {
        log('FAIL: sectionContainer missing for parentId=', parentId,
            '— .dynamic-section-container[data-parent="' + parentId + '"] not found;',
            'renderSectionContainer() may not have run yet or DOM was replaced after attachParentEvent;',
            'children will NOT be rendered for this option'
        );
        downloadIdsLogFile('fail-missing-section-container');
        return;
      }

      sectionContainer.innerHTML = '';

      // FAILURE 3: wrap TicketFieldsBuilder in try-catch
      if (sectionFields && sectionFields.length) {
        var isEdit        = this.isEdit;
        var field_options = {
          parent_class: 'ticket-field', container: sectionContainer,
          enabled: true, dropdown_blank: true, location_lf_options: this.location_lf_options
        };
        sectionFields.forEach(function (field) {
          if (!(!field.editable_in_portal && isEdit && parent.getAttribute('data-val') !== parent.value)) {
            try {
              TicketFieldsBuilder(field, field_options, self.ticketFieldValues);
            } catch (e) {
              log('FAIL: TicketFieldsBuilder threw for field',
                  'id=', field.id, 'name=', field.name,
                  'error=', String(e));
            }
          }
        });
        if (this.businessRules) {
          this.businessRules.startValidatorWithContainer('.dynamic-section-container');
        }
      }

      // FAILURE 2: render mismatch — expected fields but nothing appeared in DOM
      var renderedEls   = sectionContainer.querySelectorAll('[data-field-id]');
      var expectedCount = sectionFields ? sectionFields.length : 0;
      if (expectedCount > 0 && renderedEls.length === 0) {
        log('FAIL: render mismatch — expected', expectedCount,
            'field(s) but container is empty after TicketFieldsBuilder;',
            'parentId=', parentId, 'valId=', valId
        );
        downloadIdsLogFile('fail-render-mismatch');
      }

      if (ev && ev.displayOnly) {
        downloadIdsLogFileIfTargetField('showRelatedChild-displayOnly', parent);
      }

      log('showRelatedChild DONE', 'op=', oid);
    };

    log('prototype patch: attachParentEvent, showRelatedChild');
  }

  /* ── BOOT SEQUENCE ───────────────────────────────────────────────────── */

  function ensureHooksOnce() {
    if (window.__idsHooksInstalled) return;
    window.__idsHooksInstalled = true;
    sep('BOOT — IDS debug hooks');
    log('=== IDS debug hooks (once)', 'op=', nextOpId(), '===');
    log('environment', getEnvironmentSummary());
    patchPowerSelectPrototype();
    installWorkspaceSelectLogger();
    window.downloadIdsLogFile = downloadIdsLogFile;
    window.__idsLogBuffer     = logBuffer;
    window.__idsLog           = log;
  }

  function runBootstrap() {
    if (!isAllowedUserNow()) return false;
    ensureHooksOnce();
    if (typeof window.incidentDynamicSections === 'undefined') {
      log('runBootstrap: incidentDynamicSections not on window — prototype patch deferred');
      return false;
    }
    patchIncidentPrototypes();
    snapshotFormElements(
      document.querySelector('#new-ticket-form') || document.body,
      'after prototype patched — form state'
    );
    return true;
  }

  if (typeof jQuery !== 'undefined') {
    $(document).on('PageUpdate', function (event) {
      if (!isAllowedUserNow()) return;
      var detail = event.detail || {};
      if (detail.page === 'submit_ticket') {
        sep('PAGE UPDATE — submit_ticket re-bootstrap');
        log('PageUpdate submit_ticket — re-bootstrap');
        runBootstrap();
      }
    });
  }

  /* ── BOOTSTRAP ───────────────────────────────────────────────────────── */

  function getLoggedInEmailV2() {
    if (window.PORTAL && PORTAL.logged_in && window.USER_INFO && USER_INFO.email) {
      return String(USER_INFO.email).trim().toLowerCase();
    }
    return '';
  }

  function isAllowedUserNow() {
    var allowed = trimOrEmpty(IDS_DEBUG_ALLOWED_EMAIL).toLowerCase();
    if (!allowed) return true;
    var email = getLoggedInEmailV2();
    return email === allowed;
  }

  function waitForAllowedUser(cb) {
    var tries = 0;
    function check() {
      var email = getLoggedInEmailV2();
      if (!email && tries < 50) {
        tries += 1;
        setTimeout(check, 100);
        return;
      }
      if (isAllowedUserNow()) cb();
    }
    check();
  }

  function runBootstrapWithRetries() {
    var attempts = 0;
    function tryRun() {
      if (runBootstrap()) return;
      if (attempts < 8) {
        attempts += 1;
        log('retry bootstrap for incidentDynamicSections', 'attempt=', attempts);
        setTimeout(tryRun, attempts < 4 ? 0 : 150);
      } else {
        log('give up: incidentDynamicSections still undefined after retries');
      }
    }
    tryRun();
  }

  waitForAllowedUser(function () {
    runBootstrapWithRetries();
  });

})();
