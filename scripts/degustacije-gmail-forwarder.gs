/**
 * Forwards new reservation e-mails from the tastings mailbox to Colnix.
 *
 * Set up (about 5 minutes), signed in as the tastings mailbox:
 *  1. script.google.com → New project → paste this file.
 *  2. Project Settings (gear) → Script properties → add
 *       ENDPOINT = https://<your-colnix-domain>/api/degustacije/inbound
 *       SECRET   = the same value as DEGUSTACIJE_INBOUND_SECRET in Vercel
 *  3. Run `forwardNewReservations` once and accept the permissions.
 *  4. Triggers (clock icon) → Add trigger → forwardNewReservations →
 *     Time-driven → Minutes timer → Every minute.
 *
 * Every unread message in the inbox is sent once and then marked read, so
 * nothing is forwarded twice. Colnix also ignores a repeated message id.
 */
function forwardNewReservations() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('ENDPOINT');
  var secret = props.getProperty('SECRET');
  if (!url || !secret) throw new Error('Set ENDPOINT and SECRET in the script properties.');

  var me = Session.getActiveUser().getEmail().toLowerCase();
  var threads = GmailApp.search('in:inbox is:unread', 0, 20);
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      if (!m.isUnread()) return;
      var from = m.getFrom();
      var match = from.match(/^(.*?)\s*<(.+)>$/);
      var email = (match ? match[2] : from).toLowerCase();
      if (email === me) { m.markRead(); return; }

      var response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-colnix-secret': secret },
        muteHttpExceptions: true,
        payload: JSON.stringify({
          message_id: m.getHeader('Message-ID') || m.getId(),
          from_email: email,
          from_name: match ? match[1].replace(/^"|"$/g, '') : '',
          subject: m.getSubject(),
          text: m.getPlainBody(),
          received_at: m.getDate().toISOString()
        })
      });
      // only mark as read when Colnix accepted it, so a failure is retried next minute
      if (response.getResponseCode() === 200) m.markRead();
    });
  });
}
