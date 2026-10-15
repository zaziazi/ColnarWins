export type DunningLevel = "reminder_1" | "reminder_2" | "formal_notice" | "escalated";

export const LEVEL_ORDER: DunningLevel[] = ["reminder_1", "reminder_2", "formal_notice", "escalated"];
export const LEVEL_TEXT: Record<DunningLevel, string> = {
  reminder_1: "Prijazen opomin",
  reminder_2: "Drugi opomin",
  formal_notice: "Zadnji opomin pred tožbo",
  escalated: "Osebni klic",
};

/** Level due for an invoice that is this many days past its due date (null = not yet). */
export function levelFor(daysOverdue: number): DunningLevel | null {
  if (daysOverdue >= 60) return "escalated";
  if (daysOverdue >= 30) return "formal_notice";
  if (daysOverdue >= 15) return "reminder_2";
  if (daysOverdue >= 3) return "reminder_1";
  return null;
}

export function reminderText(args: { level: DunningLevel; customer: string; number: string | null; amount: string; dueOn: string | null }): { subject: string; body: string } {
  const inv = args.number ? `račun št. ${args.number}` : "račun";
  const due = args.dueOn ? ` z rokom plačila ${args.dueOn}` : "";
  const sign = "Lep pozdrav,\nVinska klet Colnar";
  if (args.level === "reminder_1") {
    return {
      subject: `Opomin: ${inv}`,
      body: `Spoštovani,\n\nopozarjamo Vas, da na našem računu še nismo zaznali plačila za ${inv}${due}, v znesku ${args.amount}. Morda je plačilo že na poti – v tem primeru prosimo, da to sporočilo prezrete.\n\nČe imate vprašanja, nam odgovorite na to sporočilo.\n\n${sign}`,
    };
  }
  if (args.level === "reminder_2") {
    return {
      subject: `Ponovni opomin: ${inv}`,
      body: `Spoštovani,\n\nže nekaj časa čakamo na plačilo za ${inv}${due}, v znesku ${args.amount}. Prosimo Vas, da obveznost poravnate v naslednjih dneh ali nam sporočite, kdaj lahko pričakujemo plačilo.\n\n${sign}`,
    };
  }
  return {
    subject: `Zadnji opomin pred nadaljnjimi koraki: ${inv}`,
    body: `Spoštovani,\n\nkljub opominom nismo prejeli plačila za ${inv}${due}, v znesku ${args.amount}. Če obveznosti ne poravnate v 8 dneh, bomo prisiljeni uveljavljati terjatev po drugih poteh.\n\n${sign}`,
  };
}
