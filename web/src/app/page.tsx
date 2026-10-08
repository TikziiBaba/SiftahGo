import Link from "next/link";
import {
  BarChart3,
  BellRing,
  Contact,
  CalendarClock,
  CalendarDays,
  Clock3,
  QrCode,
  Smartphone,
  Star,
  Store,
  Users,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { CATEGORIES, SITE_DOMAIN } from "@/lib/constants";

const FEATURES = [
  { icon: CalendarClock, title: "7/24 online randevu", text: "Müşterileriniz siz meşgulken bile boş saatleri görüp randevu alır. Telefon trafiği biter." },
  { icon: CalendarDays, title: "Çakışmasız takvim", text: "Aynı saate iki randevu verilemez. Çalışma saatleri, izinler ve tatiller otomatik hesaba katılır." },
  { icon: Users, title: "Personel yönetimi", text: "Her çalışanın kendi takvimi olur. Müşteri isterse ustasını kendisi seçer." },
  { icon: BellRing, title: "Anlık bildirim", text: "Yeni randevular panelinize anında düşer. Onaylayın, tamamlandı veya gelmedi olarak işaretleyin." },
  { icon: Contact, title: "Müşteri defteri", text: "Kim kaç kez geldi, ne kadar harcadı, en son ne zaman uğradı. WhatsApp’tan tek dokunuşla hatırlatın." },
  { icon: BarChart3, title: "Ciro raporları", text: "Günlük ciro, en çok satan hizmet, personel performansı ve gelmeme oranı tek ekranda." },
  { icon: Star, title: "Müşteri yorumları", text: "Hizmet alan müşteriler puan verir; yüksek puanınız yeni müşteri getirir." },
  { icon: QrCode, title: "QR kod ve bağlantı", text: "Dükkânınıza QR kodu asın, Instagram profilinize bağlantınızı ekleyin." },
  { icon: Smartphone, title: "Her cihazda", text: "Bilgisayar, tablet ve telefondan çalışır. iOS ve Android uygulaması da var." },
];

const STEPS = [
  { title: "Ücretsiz hesap açın", text: "İşletme adınızı ve kategorinizi girin. 1 dakika sürer." },
  { title: "Hizmet ve saatlerinizi ekleyin", text: "Fiyat, süre, çalışma saatleri ve personelinizi tanımlayın." },
  { title: "Bağlantınızı paylaşın", text: `${SITE_DOMAIN}/isletmeniz adresinden ilk siftahınızı yapın.` },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-gradient-to-b from-brand-50 to-transparent" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 md:grid-cols-2 md:pt-24">
            <div>
              <span className="chip bg-brand-100 text-brand-800">Esnaf için ücretsiz randevu sistemi</span>
              <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-stone-900 md:text-5xl">
                Randevular düzende, <span className="text-brand-700">siftah sabahtan.</span>
              </h1>
              <p className="mt-5 max-w-lg text-lg text-stone-600">
                Berberden halı sahaya, kuaförden oto yıkamaya kadar tüm işletmeler için online randevu,
                takvim ve müşteri yönetimi. Kurulum yok, telefon trafiği yok.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/kayit?rol=isletme" className="btn btn-primary px-6 py-3 text-base">
                  <Store className="size-5" /> İşletmemi Ekle
                </Link>
                <Link href="/kesfet" className="btn btn-secondary px-6 py-3 text-base">
                  Randevu Al
                </Link>
              </div>
            </div>
            <HeroPreview />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-center text-sm font-medium text-stone-500">Her sektörden esnaf için</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {CATEGORIES.filter((c) => c.id !== "diger").map((c) => (
              <Link
                key={c.id}
                href={`/kesfet?kategori=${c.id}`}
                className="chip border border-stone-200 bg-white px-3.5 py-1.5 text-sm text-stone-700 hover:border-brand-500 hover:text-brand-700"
              >
                {c.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-3xl font-bold tracking-tight">İşinizi büyütmek için gereken her şey</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-6">
                <f.icon className="size-6 text-brand-700" />
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-center text-3xl font-bold tracking-tight">3 adımda hazır</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-700 font-bold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold">{s.title}</h3>
                    <p className="mt-1 text-sm text-stone-600">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="rounded-3xl bg-brand-800 px-6 py-12 text-center text-white md:px-12">
            <h2 className="text-3xl font-bold tracking-tight">Bugün başlayın, ilk randevunuz yarın gelsin</h2>
            <p className="mx-auto mt-3 max-w-xl text-brand-100">
              Kredi kartı gerekmez. Dakikalar içinde işletme sayfanız yayında.
            </p>
            <Link href="/kayit?rol=isletme" className="btn mt-8 bg-white px-6 py-3 text-base text-brand-800 hover:bg-brand-50">
              Ücretsiz Hesap Aç
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function HeroPreview() {
  const rows = [
    { time: "09:30", name: "Mehmet K.", service: "Saç Kesimi", status: "Onaylandı", cls: "bg-emerald-100 text-emerald-800" },
    { time: "10:00", name: "Ayşe D.", service: "Fön + Bakım", status: "Onaylandı", cls: "bg-emerald-100 text-emerald-800" },
    { time: "11:15", name: "Can Y.", service: "Saç + Sakal", status: "Onay bekliyor", cls: "bg-amber-100 text-amber-800" },
    { time: "13:00", name: "Zeynep A.", service: "Saç Boyama", status: "Onaylandı", cls: "bg-emerald-100 text-emerald-800" },
  ];
  return (
    <div className="card p-5 shadow-xl shadow-brand-900/5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-stone-500">Bugün</p>
          <p className="font-semibold">4 randevu · ₺1.650</p>
        </div>
        <Clock3 className="size-5 text-brand-700" />
      </div>
      <ul className="mt-4 space-y-2">
        {rows.map((r) => (
          <li key={r.time} className="flex items-center gap-3 rounded-xl bg-stone-50 p-3">
            <span className="w-12 text-sm font-semibold text-stone-900">{r.time}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.name}</p>
              <p className="truncate text-xs text-stone-500">{r.service}</p>
            </div>
            <span className={`chip ${r.cls}`}>{r.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
