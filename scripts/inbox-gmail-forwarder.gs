/**
 * Forwards new e-mails from the office mailbox (e.g. info@) to Colnix "Pošta".
 * Works for a Gmail / Google Workspace mailbox. For another provider, any
 * mail-to-webhook service that POSTs the same JSON works too.
 *
 * Set up (about 5 minutes), signed in as the office mailbox:
 *  1. script.google.com → New project → paste this file.
 *  2. Project Settings (gear) → Script properties → add
 *       ENDPOINT = https://<your-colnix-domain>/api/inbox/inbound
 *       SECRET   = the same value as INBOX_INBOUND_SECRET in Vercel
 *  3. Run `forwardNewMail` once and accept the permissions.
 *  4. Triggers (clock icon) → Add trigger → forwardNewMail →
 *     Time-driven → Minutes timer → Every minute.
 *
 * Every unread message in the inbox is sent once and then marked read; Colnix
 * also ignores a repeated Message-ID. Mail is NOT deleted, moved or answered.
 * Up to 3 PDF / image attachments (max 6 MB each) are sent along, so supplier
 * bills can be read.
 */
function forwardNewMail() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('ENDPOINT');
  var secret = props.getProperty('SECRET');
  if (!url || !secret) throw new Error('Set ENDPOINT and SECRET in the script properties.');

  var me = Session.getActiveUser().getEmail().toLowerCase();
  var threads = GmailApp.search('in:inbox is:unread', 0, 15);
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      if (!m.isUnread()) return;
      var from = m.getFrom();
      var match = from.match(/^(.*?)\s*<(.+)>$/);
      var email = (match ? match[2] : from).toLowerCase();
      if (email === me) { m.markRead(); return; }

      var attachments = [];
      m.getAttachments({ includeInlineImages: false, includeAttachments: true }).forEach(function (a) {
        var type = a.getContentType();
        if (attachments.length >= 3) return;
        if (!/^(application\/pdf|image\/(png|jpe?g))$/i.test(type)) return;
        if (a.getSize() > 6 * 1024 * 1024) return;
        attachments.push({
          filename: a.getName(),
          content_type: type,
          data_base64: Utilities.base64Encode(a.getBytes())
        });
      });

      var response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-colnix-secret': secret },
        muteHttpExceptions: true,
        payload: JSON.stringify({
          message_id: m.getHeader('Message-ID') || m.getId(),
          from_email: email,
          from_name: match ? match[1].replace(/^"|"$/g, '') : '',
          to_email: m.getTo(),
          subject: m.getSubject(),
          text: m.getPlainBody(),
          received_at: m.getDate().toISOString(),
          attachments: attachments
        })
      });
      if (response.getResponseCode() === 200) m.markRead();
    });
  });
}
