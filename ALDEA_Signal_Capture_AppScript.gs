// ============================================================
// ALDEA Signal Capture — Google Apps Script
// ============================================================
// Paste this into Extensions > Apps Script in the CRM Google Sheet.
// Deploy as Web App:
//   Execute as: Me
//   Who has access: Anyone
// Copy the deployment URL and paste it into the HTML form (CONFIG.SCRIPT_URL).
// ============================================================

// --- Configuration ---
var CONFIG = {
  PIPELINE_SHEET: '2_PIPELINE',
  UNITS_SHEET: '3_UNITS',
  SETUP_SHEET: '0_SETUP',
  APP_URL: 'https://aldea-signal-capture.vercel.app',
  NOTIFICATION_FROM: 'relations@aldeacomporta.com',
  NOTIFICATION_FROM_NAME: 'ALDEA Relations',

  // Pipeline columns (1-indexed)
  COL_LEAD_NAME: 2,        // B: Lead Name
  COL_OWNER: 3,            // C: Owner
  COL_STAGE: 4,            // D: Stage
  COL_PRIORITY: 5,         // E: Priority
  COL_LAST_CONTACT: 18,    // R: Last Contact Summary
  COL_NEXT_ACTION: 19,     // S: Next Action
  COL_NEXT_ACTION_DATE: 20, // T: Next Action Date
  COL_NEXT_ACTION_OWNER: 21,// U: Next Action Owner
  COL_CONTACT_LOG: 22,     // V: Contact Log
  COL_UNIT_SELECTED: 16,   // P: Unit Selected

  // Setup: Owners dropdown range
  OWNERS_START_ROW: 18,
  OWNERS_END_ROW: 28,
  OWNERS_COL: 9,           // I
  OWNER_EMAIL_COL: 10,     // J

  // Pipeline data starts at row 3 (row 1 = title, row 2 = headers)
  PIPELINE_DATA_START: 3
};


// ============================================================
// doGet — Returns lead names and owners as JSON
// ============================================================
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    var pipeline = ss.getSheetByName(CONFIG.PIPELINE_SHEET);
    var leadRows = getPipelineRows_(pipeline);

    var unitsSheet = ss.getSheetByName(CONFIG.UNITS_SHEET);
    var unitRows = getUnitRows_(unitsSheet);

    var setup = ss.getSheetByName(CONFIG.SETUP_SHEET);
    var owners = [];
    var ownerRange = setup.getRange(
      CONFIG.OWNERS_START_ROW,
      CONFIG.OWNERS_COL,
      CONFIG.OWNERS_END_ROW - CONFIG.OWNERS_START_ROW + 1,
      1
    ).getValues();

    for (var j = 0; j < ownerRange.length; j++) {
      var owner = ownerRange[j][0];
      if (owner && String(owner).trim() !== '') {
        owners.push(String(owner).trim());
      }
    }

    var overdueActions = [];
    var comingActions = [];
    try {
      overdueActions = getOverdueActions_(pipeline);
      comingActions = getComingActions_(pipeline);
    } catch (overdueError) {
      // Do not block the core logging app if the dashboard summary cannot be built.
      overdueActions = [];
      comingActions = [];
    }

    var result = {
      success: true,
      leads: leadRows.map(function(row) { return row.leadName; }),
      pipelineRows: leadRows,
      units: unitRows,
      owners: owners,
      overdueActions: overdueActions,
      comingActions: comingActions
    };

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.message
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getPipelineRows_(pipeline) {
  var rows = [];
  var lastRow = pipeline.getLastRow();
  if (lastRow < CONFIG.PIPELINE_DATA_START) return rows;

  var values = pipeline.getRange(
    CONFIG.PIPELINE_DATA_START,
    1,
    lastRow - CONFIG.PIPELINE_DATA_START + 1,
    CONFIG.COL_CONTACT_LOG
  ).getValues();

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var leadName = row[CONFIG.COL_LEAD_NAME - 1];
    if (!leadName || String(leadName).trim() === '') continue;
    rows.push({
      leadId: row[0] ? String(row[0]).trim() : '',
      leadName: String(leadName).trim(),
      owner: row[CONFIG.COL_OWNER - 1] ? String(row[CONFIG.COL_OWNER - 1]).trim() : '',
      stage: row[CONFIG.COL_STAGE - 1] ? String(row[CONFIG.COL_STAGE - 1]).trim() : '',
      priority: row[CONFIG.COL_PRIORITY - 1] ? String(row[CONFIG.COL_PRIORITY - 1]).trim() : '',
      source: row[CONFIG.COL_PRIORITY + 1] ? String(row[CONFIG.COL_PRIORITY + 1]).trim() : '',
      sourceDetail: row[6] ? String(row[6]).trim() : '',
      nationality: row[7] ? String(row[7]).trim() : '',
      email1: row[8] ? String(row[8]).trim() : '',
      email2: row[9] ? String(row[9]).trim() : '',
      phone: row[10] ? String(row[10]).trim() : '',
      interestType: row[11] ? String(row[11]).trim() : '',
      typology: row[12] ? String(row[12]).trim() : '',
      unitPrice: row[13] ? String(row[13]).trim() : '',
      probability: row[14] ? String(row[14]).trim() : '',
      unitSelected: row[15] ? String(row[15]).trim() : '',
      lastContact: row[16] ? String(row[16]).trim() : '',
      lastContactSummary: row[17] ? String(row[17]).trim() : '',
      nextAction: row[18] ? String(row[18]).trim() : '',
      nextActionDate: row[19] ? String(row[19]).trim() : '',
      nextActionOwner: row[20] ? String(row[20]).trim() : '',
      contactLog: row[21] ? String(row[21]).trim() : ''
    });
  }
  return rows;
}

function getUnitRows_(sheet) {
  var rows = [];
  var lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.PIPELINE_DATA_START) return rows;

  var lastColumn = sheet.getLastColumn();
  var headers = sheet.getRange(2, 1, 1, lastColumn).getValues()[0];
  var headerMap = {};
  for (var h = 0; h < headers.length; h++) {
    headerMap[normalizeHeader_(headers[h])] = h;
  }

  var values = sheet.getRange(3, 1, lastRow - 2, lastColumn).getValues();
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var unitId = getUnitCell_(row, headerMap, ['unit id', 'unit', 'unit number'], 0);
    if (!unitId || String(unitId).trim() === '') continue;
    rows.push({
      unitId: String(unitId).trim(),
      status: toTrimmedString_(getUnitCell_(row, headerMap, ['status'], 1)),
      typology: toTrimmedString_(getUnitCell_(row, headerMap, ['typology', 'type'], 2)),
      sqm: toTrimmedString_(getUnitCell_(row, headerMap, ['sqm', 'sq m', 'm2'], 3)),
      listPrice: toTrimmedString_(getUnitCell_(row, headerMap, ['list price', 'list price (€)', 'list price eur'], 4)),
      pricePerSqm: toTrimmedString_(getUnitCell_(row, headerMap, ['price / sqm', 'price/sqm', 'price per sqm'], 5)),
      linkedLeadId: toTrimmedString_(getUnitCell_(row, headerMap, ['linked lead id'], 7)),
      linkedBuyerName: toTrimmedString_(getUnitCell_(row, headerMap, ['linked buyer name', 'assigned lead', 'buyer name'], 8)),
      stageInPipeline: toTrimmedString_(getUnitCell_(row, headerMap, ['stage in pipeline', 'pipeline stage'], 9))
    });
  }
  return rows;
}

function getUnitCell_(row, headerMap, headerNames, fallbackIndex) {
  for (var i = 0; i < headerNames.length; i++) {
    var index = headerMap[normalizeHeader_(headerNames[i])];
    if (index !== undefined) {
      return row[index];
    }
  }
  return row[fallbackIndex];
}

function normalizeHeader_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTrimmedString_(value) {
  return value ? String(value).trim() : '';
}

// ============================================================
// getOverdueActions_ — Returns open next actions before today
// ============================================================
function getOverdueActions_(pipeline) {
  var lastRow = pipeline.getLastRow();
  var overdue = [];

  if (lastRow < CONFIG.PIPELINE_DATA_START) {
    return overdue;
  }

  var numRows = lastRow - CONFIG.PIPELINE_DATA_START + 1;
  var values = pipeline.getRange(CONFIG.PIPELINE_DATA_START, 1, numRows, CONFIG.COL_NEXT_ACTION_OWNER).getValues();
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var leadName = row[CONFIG.COL_LEAD_NAME - 1];
    var owner = row[CONFIG.COL_OWNER - 1];
    var stage = row[CONFIG.COL_STAGE - 1];
    var priority = row[CONFIG.COL_PRIORITY - 1];
    var nextAction = row[CONFIG.COL_NEXT_ACTION - 1];
    var nextActionDate = row[CONFIG.COL_NEXT_ACTION_DATE - 1];
    var nextActionOwner = row[CONFIG.COL_NEXT_ACTION_OWNER - 1];

    if (!leadName || !nextAction || !nextActionDate) {
      continue;
    }

    var actionDate = coerceDate_(nextActionDate);
    if (!actionDate) {
      continue;
    }
    actionDate.setHours(0, 0, 0, 0);

    if (actionDate < today) {
      var daysOverdue = Math.floor((today.getTime() - actionDate.getTime()) / (24 * 60 * 60 * 1000));
      overdue.push({
        buyerName: String(leadName).trim(),
        leadName: String(leadName).trim(),
        owner: owner ? String(owner).trim() : '',
        stage: stage ? String(stage).trim() : '',
        priority: priority ? String(priority).trim() : '',
        nextAction: String(nextAction).trim(),
        dueDate: Utilities.formatDate(actionDate, Session.getScriptTimeZone(), 'yyyy/MM/dd'),
        nextActionDate: Utilities.formatDate(actionDate, Session.getScriptTimeZone(), 'yyyy/MM/dd'),
        daysOverdue: daysOverdue,
        nextActionOwner: nextActionOwner ? String(nextActionOwner).trim() : ''
      });
    }
  }

  overdue.sort(function(a, b) {
    return b.daysOverdue - a.daysOverdue;
  });

  return overdue.slice(0, 25);
}

// ============================================================
// getComingActions_ — Returns open next actions due in next 2 weeks
// ============================================================
function getComingActions_(pipeline) {
  var lastRow = pipeline.getLastRow();
  var coming = [];

  if (lastRow < CONFIG.PIPELINE_DATA_START) {
    return coming;
  }

  var numRows = lastRow - CONFIG.PIPELINE_DATA_START + 1;
  var values = pipeline.getRange(CONFIG.PIPELINE_DATA_START, 1, numRows, CONFIG.COL_NEXT_ACTION_OWNER).getValues();
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var limit = new Date(today.getTime());
  limit.setDate(limit.getDate() + 14);

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var leadName = row[CONFIG.COL_LEAD_NAME - 1];
    var owner = row[CONFIG.COL_OWNER - 1];
    var stage = row[CONFIG.COL_STAGE - 1];
    var priority = row[CONFIG.COL_PRIORITY - 1];
    var nextAction = row[CONFIG.COL_NEXT_ACTION - 1];
    var nextActionDate = row[CONFIG.COL_NEXT_ACTION_DATE - 1];
    var nextActionOwner = row[CONFIG.COL_NEXT_ACTION_OWNER - 1];

    if (!leadName || !nextAction || !nextActionDate) {
      continue;
    }

    var actionDate = coerceDate_(nextActionDate);
    if (!actionDate) {
      continue;
    }
    actionDate.setHours(0, 0, 0, 0);

    if (actionDate >= today && actionDate <= limit) {
      var daysUntilDue = Math.floor((actionDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      coming.push({
        buyerName: String(leadName).trim(),
        leadName: String(leadName).trim(),
        owner: owner ? String(owner).trim() : '',
        stage: stage ? String(stage).trim() : '',
        priority: priority ? String(priority).trim() : '',
        nextAction: String(nextAction).trim(),
        dueDate: Utilities.formatDate(actionDate, Session.getScriptTimeZone(), 'yyyy/MM/dd'),
        nextActionDate: Utilities.formatDate(actionDate, Session.getScriptTimeZone(), 'yyyy/MM/dd'),
        daysUntilDue: daysUntilDue,
        nextActionOwner: nextActionOwner ? String(nextActionOwner).trim() : ''
      });
    }
  }

  coming.sort(function(a, b) {
    return parseActionDateForSort_(a.dueDate) - parseActionDateForSort_(b.dueDate);
  });

  return coming.slice(0, 25);
}

function parseActionDateForSort_(value) {
  var parts = String(value).split('/');
  if (parts.length !== 3) return 0;
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getTime();
}

function coerceDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return new Date(value.getTime());
  }

  if (typeof value === 'string') {
    var trimmed = value.trim();
    if (!trimmed) return null;

    var iso = trimmed.match(/^(\d{4})[-\/](\d{2})[-\/](\d{2})/);
    if (iso) {
      return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
    }

    var dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (dmy) {
      var year = parseInt(dmy[3], 10);
      if (year < 100) year += 2000;
      return new Date(year, parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
    }
  }

  return null;
}

function parseDateForSort_(value) {
  var parts = String(value).split('/');
  if (parts.length !== 3) return 0;
  return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime();
}


// ============================================================
// doPost — Writes signal data to Pipeline
// ============================================================
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Route by action
    if (data.action === 'createLead') {
      return handleCreateLead(data);
    }
    if (data.action === 'updateLeadDetails') {
      return handleUpdateLeadDetails(data);
    }

    // Default action: logSignal
    // Validate required fields
    var required = ['leadName', 'whatHappened', 'nextAction', 'nextActionDate', 'nextActionOwner', 'submitter'];
    for (var r = 0; r < required.length; r++) {
      if (!data[required[r]] || String(data[required[r]]).trim() === '') {
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: 'Missing required field: ' + required[r]
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var pipeline = ss.getSheetByName(CONFIG.PIPELINE_SHEET);
    var lastRow = pipeline.getLastRow();

    // Find the lead's row by matching Lead Name (Col B)
    var leadRow = -1;
    var nameRange = pipeline.getRange(
      CONFIG.PIPELINE_DATA_START,
      CONFIG.COL_LEAD_NAME,
      lastRow - CONFIG.PIPELINE_DATA_START + 1,
      1
    ).getValues();

    for (var i = 0; i < nameRange.length; i++) {
      if (String(nameRange[i][0]).trim() === String(data.leadName).trim()) {
        leadRow = i + CONFIG.PIPELINE_DATA_START;
        break;
      }
    }

    if (leadRow === -1) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: 'Lead not found: ' + data.leadName
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Build the timestamped entry
    var now = new Date();
    var timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM HH:mm');
    var logEntry = '[' + timestamp + ' — ' + data.submitter + '] ' + data.whatHappened;

    // Read existing Contact Log (Col V)
    var existingLog = pipeline.getRange(leadRow, CONFIG.COL_CONTACT_LOG).getValue();
    var newLog;
    if (existingLog && String(existingLog).trim() !== '') {
      newLog = logEntry + '\n' + String(existingLog);
    } else {
      newLog = logEntry;
    }

    var unitSelected = data.unitSelected ? String(data.unitSelected).trim() : '';

    // Write to Pipeline
    // Col V: Contact Log (prepend)
    pipeline.getRange(leadRow, CONFIG.COL_CONTACT_LOG).setValue(newLog);

    // Col R: Last Contact Summary (overwrite with latest only)
    pipeline.getRange(leadRow, CONFIG.COL_LAST_CONTACT).setValue(logEntry);

    // Col S: Next Action (overwrite)
    pipeline.getRange(leadRow, CONFIG.COL_NEXT_ACTION).setValue(data.nextAction);

    // Col T: Next Action Date (overwrite)
    // Parse the date string from the form (YYYY-MM-DD) into a Date object
    var dateParts = String(data.nextActionDate).split('-');
    if (dateParts.length === 3) {
      var actionDate = new Date(
        parseInt(dateParts[0]),
        parseInt(dateParts[1]) - 1,
        parseInt(dateParts[2])
      );
      pipeline.getRange(leadRow, CONFIG.COL_NEXT_ACTION_DATE).setValue(actionDate);
    } else {
      pipeline.getRange(leadRow, CONFIG.COL_NEXT_ACTION_DATE).setValue(data.nextActionDate);
    }

    // Col U: Next Action Owner (overwrite)
    pipeline.getRange(leadRow, CONFIG.COL_NEXT_ACTION_OWNER).setValue(data.nextActionOwner);

    pipeline.getRange(leadRow, CONFIG.COL_UNIT_SELECTED).setValue(unitSelected);

    // Col Q: Last Contact date (update to now)
    pipeline.getRange(leadRow, 17).setValue(now);

    try {
      sendAssignmentEmailIfNeeded_(ss, data);
    } catch (emailError) {
      console.error('Assignment email failed: ' + emailError.message);
    }

    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        lead: data.leadName,
        timestamp: timestamp
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.message
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// sendAssignmentEmailIfNeeded_ — Notifies another owner of a task
// ============================================================
function sendAssignmentEmailIfNeeded_(ss, data) {
  var submitter = String(data.submitter || '').trim();
  var nextOwner = String(data.nextActionOwner || '').trim();

  if (!nextOwner || normalizeOwnerName_(nextOwner) === normalizeOwnerName_(submitter)) {
    return;
  }

  var ownerEmails = getOwnerEmailMap_(ss);
  var recipient = ownerEmails[normalizeOwnerName_(nextOwner)];
  if (!recipient) {
    return;
  }

  var dueDate = formatActionDateForEmail_(data.nextActionDate);
  var subject = 'New ALDEA next action: ' + data.leadName;
  var plainBody =
    'Hi ' + nextOwner + ',\n\n' +
    submitter + ' assigned you a new ALDEA next action.\n\n' +
    'Lead: ' + data.leadName + '\n' +
    'Next action: ' + data.nextAction + '\n' +
    'Due date: ' + dueDate + '\n\n' +
    'Latest signal:\n' + data.whatHappened + '\n\n' +
    'Open the ALDEA Lead Tracker:\n' + CONFIG.APP_URL;

  var htmlBody =
    '<p>Hi ' + escapeHtml_(nextOwner) + ',</p>' +
    '<p><strong>' + escapeHtml_(submitter) + '</strong> assigned you a new ALDEA next action.</p>' +
    '<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">' +
    '<tr><td><strong>Lead</strong></td><td>' + escapeHtml_(data.leadName) + '</td></tr>' +
    '<tr><td><strong>Next action</strong></td><td>' + escapeHtml_(data.nextAction) + '</td></tr>' +
    '<tr><td><strong>Due date</strong></td><td>' + escapeHtml_(dueDate) + '</td></tr>' +
    '</table>' +
    '<p><strong>Latest signal</strong><br>' + escapeHtml_(data.whatHappened).replace(/\n/g, '<br>') + '</p>' +
    '<p><a href="' + CONFIG.APP_URL + '" style="display:inline-block;background:#8B6C59;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;">Open ALDEA Lead Tracker</a></p>';

  sendEmailFromConfiguredAlias_(recipient, subject, plainBody, htmlBody);
}

function validateNotificationSender_() {
  var aliases = GmailApp.getAliases();
  if (aliases.indexOf(CONFIG.NOTIFICATION_FROM) === -1) {
    throw new Error(CONFIG.NOTIFICATION_FROM + ' is not configured as a Gmail send-as alias for this Apps Script account.');
  }
}

function sendEmailFromConfiguredAlias_(recipient, subject, plainBody, htmlBody) {
  validateNotificationSender_();
  GmailApp.sendEmail(recipient, subject, plainBody, {
    from: CONFIG.NOTIFICATION_FROM,
    name: CONFIG.NOTIFICATION_FROM_NAME,
    replyTo: CONFIG.NOTIFICATION_FROM,
    htmlBody: htmlBody
  });
}

function testNotificationSenderAlias() {
  validateNotificationSender_();
  return CONFIG.NOTIFICATION_FROM + ' is available as a send-as alias.';
}

function getOwnerEmailMap_(ss) {
  var setup = ss.getSheetByName(CONFIG.SETUP_SHEET);
  var rows = setup.getRange(
    CONFIG.OWNERS_START_ROW,
    CONFIG.OWNERS_COL,
    CONFIG.OWNERS_END_ROW - CONFIG.OWNERS_START_ROW + 1,
    CONFIG.OWNER_EMAIL_COL - CONFIG.OWNERS_COL + 1
  ).getValues();

  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var owner = rows[i][0];
    var email = rows[i][CONFIG.OWNER_EMAIL_COL - CONFIG.OWNERS_COL];
    if (owner && email) {
      map[normalizeOwnerName_(owner)] = String(email).trim();
    }
  }
  return map;
}

function normalizeOwnerName_(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function formatActionDateForEmail_(value) {
  var date = coerceDate_(value);
  if (date) {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }
  return String(value || '');
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================
// handleCreateLead — Creates a new lead row in Pipeline
// ============================================================
function handleCreateLead(data) {
  try {
    if (!data.leadName || String(data.leadName).trim() === '') {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'Lead name is required' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var pipeline = ss.getSheetByName(CONFIG.PIPELINE_SHEET);
    var lastRow = pipeline.getLastRow();

    // Generate Lead ID: LEAD-YYYYMM-NNNN
    var now = new Date();
    var yearMonth = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMM');

    // Count existing leads to generate next sequence number
    var existingIds = pipeline.getRange(
      CONFIG.PIPELINE_DATA_START, 1,
      Math.max(1, lastRow - CONFIG.PIPELINE_DATA_START + 1), 1
    ).getValues();

    var maxSeq = 0;
    for (var i = 0; i < existingIds.length; i++) {
      var id = String(existingIds[i][0]);
      var match = id.match(/LEAD-\d+-(\d+)/);
      if (match) {
        var seq = parseInt(match[1]);
        if (seq > maxSeq) maxSeq = seq;
      }
    }
    var newSeq = String(maxSeq + 1).padStart(4, '0');
    var newLeadId = 'LEAD-' + yearMonth + '-' + newSeq;

    // Find the next empty row
    var newRow = lastRow + 1;

    // Write the new lead
    // Col A: Lead ID
    pipeline.getRange(newRow, 1).setValue(newLeadId);
    // Col B: Lead Name
    pipeline.getRange(newRow, CONFIG.COL_LEAD_NAME).setValue(String(data.leadName).trim());
    // Col C: Owner
    if (data.owner) {
      pipeline.getRange(newRow, 3).setValue(data.owner);
    }
    // Col D: Stage (default to Stage 1)
    pipeline.getRange(newRow, 4).setValue('1 - Identified');
    // Col E: Priority
    if (data.priority) {
      pipeline.getRange(newRow, CONFIG.COL_PRIORITY).setValue(String(data.priority).trim());
    }
    // Col F: Source
    if (data.source) {
      pipeline.getRange(newRow, 6).setValue(data.source);
    }
    // Col AA: Stage Entry Date
    pipeline.getRange(newRow, 27).setValue(now);

    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        leadId: newLeadId,
        leadName: String(data.leadName).trim()
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.message
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleUpdateLeadDetails(data) {
  try {
    if (!data.leadName || String(data.leadName).trim() === '') {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'Lead name is required' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var pipeline = ss.getSheetByName(CONFIG.PIPELINE_SHEET);
    var lastRow = pipeline.getLastRow();
    var leadRow = findLeadRowByName_(pipeline, String(data.leadName).trim(), lastRow);

    if (leadRow === -1) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'Lead not found: ' + data.leadName }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var updatedLeadName = data.updatedLeadName !== undefined
      ? String(data.updatedLeadName || '').trim()
      : String(data.leadName).trim();

    if (!updatedLeadName) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'Updated lead name is required' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (updatedLeadName !== String(data.leadName).trim()) {
      var duplicateRow = findLeadRowByName_(pipeline, updatedLeadName, lastRow);
      if (duplicateRow !== -1 && duplicateRow !== leadRow) {
        return ContentService
          .createTextOutput(JSON.stringify({ success: false, error: 'A lead with that name already exists.' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      pipeline.getRange(leadRow, CONFIG.COL_LEAD_NAME).setValue(updatedLeadName);
    }

    if (data.stage !== undefined) {
      pipeline.getRange(leadRow, CONFIG.COL_STAGE).setValue(String(data.stage || '').trim());
    }
    if (data.nextAction !== undefined) {
      pipeline.getRange(leadRow, CONFIG.COL_NEXT_ACTION).setValue(String(data.nextAction || '').trim());
    }
    if (data.nextActionOwner !== undefined) {
      pipeline.getRange(leadRow, CONFIG.COL_NEXT_ACTION_OWNER).setValue(String(data.nextActionOwner || '').trim());
    }
    if (data.unitSelected !== undefined) {
      pipeline.getRange(leadRow, CONFIG.COL_UNIT_SELECTED).setValue(String(data.unitSelected || '').trim());
    }
    if (data.nextActionDate !== undefined) {
      var parsedDate = coerceDate_(data.nextActionDate);
      if (parsedDate) {
        pipeline.getRange(leadRow, CONFIG.COL_NEXT_ACTION_DATE).setValue(parsedDate);
      } else {
        pipeline.getRange(leadRow, CONFIG.COL_NEXT_ACTION_DATE).setValue('');
      }
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, lead: updatedLeadName }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function findLeadRowByName_(pipeline, leadName, lastRow) {
  var nameRange = pipeline.getRange(
    CONFIG.PIPELINE_DATA_START,
    CONFIG.COL_LEAD_NAME,
    lastRow - CONFIG.PIPELINE_DATA_START + 1,
    1
  ).getValues();

  for (var i = 0; i < nameRange.length; i++) {
    if (String(nameRange[i][0]).trim() === leadName) {
      return i + CONFIG.PIPELINE_DATA_START;
    }
  }
  return -1;
}
