// Connection test for a Colnix mailbox: connects read-only and prints counts and the newest
// senders/subjects (headers only, no bodies, never the password).
//   node scripts/imap-check.mjs info@colnar.si sh23.neoserv.si IMAP_PASS_INFO
import { readFileSync } from "node:fs";
import { ImapFlow } from "imapflow";

const [user, host, passEnv] = process.argv.slice(2);
if (!user || !host || !passEnv) {
  console.error("usage: node scripts/imap-check.mjs <user> <host> <PASS_ENV_NAME>");
  process.exit(1);
}
let pass = process.env[passEnv];
if (!pass) {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] === passEnv) pass = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
if (!pass) {
  console.error(`${passEnv} is not set (.env.local or environment)`);
  process.exit(1);
}
const client = new ImapFlow({ host, port: 993, secure: true, auth: { user, pass }, logger: false, connectionTimeout: 15000 });
client.on("error", () => {});
try {
  await client.connect();
  const lock = await client.getMailboxLock("INBOX", { readOnly: true });
  try {
    const total = client.mailbox.exists;
    console.log(`connected: ${user} @ ${host} · INBOX has ${total} messages · uidValidity ${client.mailbox.uidValidity}`);
    const from = Math.max(1, total - 9);
    for await (const m of client.fetch(`${from}:*`, { envelope: true, size: true, bodyStructure: true })) {
      const att = [];
      const walk = (n) => { if (n.disposition === "attachment" || (n.parameters && n.parameters.name)) att.push(`${n.parameters?.name ?? n.dispositionParameters?.filename ?? "?"}(${n.type})`); (n.childNodes ?? []).forEach(walk); };
      walk(m.bodyStructure);
      console.log(`- ${m.envelope.date?.toISOString().slice(0, 16)} | ${m.envelope.from?.[0]?.address} | ${m.envelope.subject?.slice(0, 70)} | ${att.join(", ")}`);
    }
  } finally {
    lock.release();
  }
  await client.logout();
} catch (e) {
  console.error("FAILED:", e.responseText || e.message);
  process.exit(2);
}
