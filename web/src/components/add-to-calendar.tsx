"use client";

import { CalendarPlus } from "lucide-react";
import { googleCalendarLink } from "@/lib/format";

type Props = { title: string; startsAt: string; endsAt: string; location: string; className?: string };

/** Randevuyu Google Takvim'e (bağlantı) ya da Apple/Outlook takvimine (.ics dosyası) ekler. */
export function AddToCalendar({ title, startsAt, endsAt, location, className = "btn btn-secondary py-2" }: Props) {
  function downloadIcs() {
    const f = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//SiftahGo//TR",
      "BEGIN:VEVENT",
      `UID:${f(startsAt)}-${Math.random().toString(36).slice(2)}@siftahgo.app`,
      `DTSTAMP:${f(new Date().toISOString())}`,
      `DTSTART:${f(startsAt)}`,
      `DTEND:${f(endsAt)}`,
      `SUMMARY:${esc(title)}`,
      `LOCATION:${esc(location)}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT1H",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(title)}`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    a.download = "randevu.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <details className="relative">
      <summary className={`${className} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        <CalendarPlus className="size-4" /> Takvime ekle
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl bg-surface-2 text-sm shadow-lg ring-1 ring-line">
        <a
          href={googleCalendarLink(title, startsAt, endsAt, location)}
          target="_blank"
          rel="noreferrer"
          className="block px-3.5 py-2.5 hover:bg-tint/[0.05]"
        >
          Google Takvim
        </a>
        <button type="button" onClick={downloadIcs} className="block w-full px-3.5 py-2.5 text-left hover:bg-tint/[0.05]">
          Apple / Outlook (.ics)
        </button>
      </div>
    </details>
  );
}
