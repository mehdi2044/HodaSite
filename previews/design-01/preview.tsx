import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Decimal from "decimal.js";
import { styleProducts } from "./catalog-fixture";

type Locale = "fa" | "tr" | "en";
type Group = "women" | "men" | "kids" | "accessories";
const groups: Group[] = ["women", "men", "kids", "accessories"];
const copy = {
  fa: {
    language: "زبان",
    tagline: "برای هر روز، انتخابی تازه",
    collectionKicker: "مجموعهٔ روزمره",
    autumnKicker: "انتخاب پاییز",
    styleKicker: "یادداشت استایل",
    demo: "پیش‌نمایش طراحی · داده و خرید شبیه‌سازی‌شده",
    artwork: "تصویر نمونه",
    home: "خانه",
    bag: "سبد",
    editor: "ویرایش بنر",
    groups: ["زنانه", "مردانه", "بچگانه", "اکسسوری"],
    discover: "استایل خودت را پیدا کن",
    categories: "چهار جهان، یک استایل",
    browse: "دیدن مجموعه",
    latest: "تازه‌های منتخب",
    week: "انتخاب این هفته",
    dual: ["لایه‌های آرام پاییز", "روزهای سبک، استایل آزاد"],
    season: "فصل تازه، انتخاب تازه",
    seasonBody: "بافت‌های گرم و فرم‌های راحت برای روزهای پیش رو",
    campaign: "مجموعهٔ پاییز",
    looks: "این استایل را کامل کن",
    lookBody: "دو قطعهٔ هماهنگ؛ انتخاب سایز هر قطعه در صفحهٔ محصول",
    services: ["راهنمای ارسال", "شرایط بازگشت", "گفت‌وگو با پشتیبانی"],
    newsletter: "برای انتخاب بعدی، الهام بگیر",
    info: "اطلاعات فروشگاه",
    filter: "فیلتر",
    all: "همه",
    color: "رنگ",
    size: "سایز",
    ivory: "شیری",
    charcoal: "ذغالی",
    selected: "انتخاب شده",
    add: "افزودن به سبد نمونه",
    choose: "ابتدا سایز را انتخاب کنید",
    details: "جزییات و نگهداری",
    detailText:
      "این محصول و قیمت برای بررسی طرح هستند. جنس و شرایط فروش نهایی باید از اطلاعات تأییدشدهٔ محصول خوانده شوند.",
    empty: "هنوز انتخابی نکرده‌اید",
    reset: "پاک‌کردن فیلترها",
    quantity: "تعداد",
    remove: "حذف",
    summary: "خلاصهٔ نمونه",
    total: "جمع نمونه",
    checkout: "ادامهٔ نمونه",
    mockCheckout: "پایان پیش‌نمایش: سفارش یا پرداختی ثبت نشد.",
    title: "عنوان",
    body: "توضیح",
    cta: "متن دکمه",
    target: "دستهٔ مقصد",
    count: "تعداد محصولات",
    enabled: "نمایش بخش",
    save: "ذخیرهٔ پیش‌نویس محلی",
    rollback: "بازگشت پیش‌نویس",
    saved: "فقط در این مرورگر ذخیره شد؛ سایت واقعی تغییر نکرد",
    panel: "تنظیمات و پیش‌نمایش",
    long: "متن بلند",
    loading: "بارگذاری",
    error: "خطا",
    state: "حالت نمایش",
    retry: "تلاش دوباره",
    noResults: "محصولی با این انتخاب پیدا نشد",
    pause: "توقف حرکت",
    play: "ادامهٔ حرکت",
    motion: "حرکت ظریف",
    compare: "مبنای فعلی",
    proposal: "طرح پیشنهادی",
    video: "جایگاه ویدیوی ۵–۸ ثانیه‌ای · فعلاً تصویر جایگزین",
    help: "عنوان، رسانه، مقصد، زمان و ترتیب از پنل واقعی در مرحلهٔ بعد کنترل می‌شوند.",
    footer: "خدمات، شرایط و اطلاعات تماس از تنظیمات تأییدشدهٔ فروشگاه",
    scope: "بازار",
    mobile: "نسخهٔ موبایل",
    source: "منبع: انتخاب تحریریه؛ ادعای پرفروش یا تخفیف نیست",
    editorNote:
      "این فرم شبیه‌سازی است. انتشار زمان‌بندی‌شده و سابقهٔ سروری هنوز پیاده نشده‌اند.",
    close: "بستن",
    zoom: "نمایش کامل تصویر",
  },
  tr: {
    language: "Dil",
    tagline: "Her gün, yeni bir seçim",
    collectionKicker: "Günlük koleksiyon",
    autumnKicker: "Sonbahar seçkisi",
    styleKicker: "Stil notu",
    demo: "Tasarım önizlemesi · örnek veri ve alışveriş",
    artwork: "Örnek görsel",
    home: "Ana sayfa",
    bag: "Sepet",
    editor: "Banner düzenle",
    groups: ["Kadın", "Erkek", "Çocuk", "Aksesuar"],
    discover: "Kendi stilini keşfet",
    categories: "Dört dünya, bir stil",
    browse: "Koleksiyonu keşfet",
    latest: "Seçili yenilikler",
    week: "Haftanın seçkisi",
    dual: ["Sonbaharın sakin katmanları", "Hafif günler, özgür stil"],
    season: "Yeni mevsim, yeni seçimler",
    seasonBody: "Önümüzdeki günler için sıcak dokular ve rahat kesimler",
    campaign: "Sonbahar koleksiyonu",
    looks: "Bu stili tamamla",
    lookBody: "İki uyumlu parça; her ürünün bedenini ürün sayfasında seçin",
    services: ["Teslimat rehberi", "İade koşulları", "Destek ile iletişim"],
    newsletter: "Bir sonraki seçim için ilham",
    info: "Mağaza bilgileri",
    filter: "Filtre",
    all: "Tümü",
    color: "Renk",
    size: "Beden",
    ivory: "Ekru",
    charcoal: "Antrasit",
    selected: "Seçildi",
    add: "Örnek sepete ekle",
    choose: "Önce bir beden seçin",
    details: "Detaylar ve bakım",
    detailText:
      "Ürün ve fiyat tasarım incelemesi içindir. Gerçek malzeme ve satış koşulları onaylı ürün verisinden gelir.",
    empty: "Henüz bir seçim yok",
    reset: "Filtreleri temizle",
    quantity: "Adet",
    remove: "Kaldır",
    summary: "Örnek özet",
    total: "Örnek toplam",
    checkout: "Örnek devam",
    mockCheckout: "Önizleme sonu: sipariş veya ödeme oluşturulmadı.",
    title: "Başlık",
    body: "Açıklama",
    cta: "Düğme metni",
    target: "Hedef kategori",
    count: "Ürün sayısı",
    enabled: "Bölümü göster",
    save: "Yerel taslağı kaydet",
    rollback: "Taslağı geri al",
    saved: "Yalnızca bu tarayıcıda kaydedildi; gerçek site değişmedi",
    panel: "Ayarlar ve önizleme",
    long: "Uzun metin",
    loading: "Yükleniyor",
    error: "Hata",
    state: "Görünüm durumu",
    retry: "Tekrar dene",
    noResults: "Bu seçimde ürün bulunamadı",
    pause: "Hareketi durdur",
    play: "Hareketi sürdür",
    motion: "Hafif hareket",
    compare: "Mevcut temel",
    proposal: "Önerilen tasarım",
    video: "5–8 saniyelik video alanı · şimdilik poster",
    help: "Başlık, medya, hedef, zaman ve sıra sonraki aşamada gerçek panelden yönetilir.",
    footer: "Hizmetler, koşullar ve iletişim onaylı mağaza ayarlarından gelir",
    scope: "Pazar",
    mobile: "Mobil sürüm",
    source: "Kaynak: editör seçkisi; çok satan veya indirim iddiası yok",
    editorNote:
      "Bu form simülasyondur. Sunucu yayın takvimi ve sürüm geçmişi henüz uygulanmadı.",
    close: "Kapat",
    zoom: "Tam görsel",
  },
  en: {
    language: "Language",
    tagline: "Your everyday, reimagined",
    collectionKicker: "The everyday collection",
    autumnKicker: "Autumn edit",
    styleKicker: "The style note",
    demo: "Design preview · simulated data and shopping",
    artwork: "Demo artwork",
    home: "Home",
    bag: "Bag",
    editor: "Edit banner",
    groups: ["Women", "Men", "Kids", "Accessories"],
    discover: "Find your own rhythm",
    categories: "Four worlds. One style.",
    browse: "Explore the collection",
    latest: "Selected new arrivals",
    week: "This week’s edit",
    dual: ["Quiet layers for autumn", "Easy days, effortless style"],
    season: "A new season of possibility",
    seasonBody: "Warm textures and easy silhouettes for the days ahead",
    campaign: "The autumn collection",
    looks: "Complete the look",
    lookBody: "Two coordinated pieces; choose each size on its product page",
    services: ["Delivery guide", "Return policy", "Talk to support"],
    newsletter: "Inspiration for your next chapter",
    info: "Store information",
    filter: "Filter",
    all: "All",
    color: "Color",
    size: "Size",
    ivory: "Ivory",
    charcoal: "Charcoal",
    selected: "Selected",
    add: "Add to demo bag",
    choose: "Choose a size first",
    details: "Details and care",
    detailText:
      "This product and price are for design review. Final material and selling terms must come from approved product data.",
    empty: "Your edit starts here",
    reset: "Clear filters",
    quantity: "Quantity",
    remove: "Remove",
    summary: "Demo summary",
    total: "Demo total",
    checkout: "Continue demo",
    mockCheckout: "Preview complete: no order or payment was created.",
    title: "Title",
    body: "Description",
    cta: "Button label",
    target: "Destination category",
    count: "Product count",
    enabled: "Show section",
    save: "Save local draft",
    rollback: "Restore previous draft",
    saved: "Saved only in this browser; the real store is unchanged",
    panel: "Settings and preview",
    long: "Long copy",
    loading: "Loading",
    error: "Error",
    state: "Display state",
    retry: "Try again",
    noResults: "No products match this selection",
    pause: "Pause motion",
    play: "Resume motion",
    motion: "Subtle motion",
    compare: "Current baseline",
    proposal: "Proposed design",
    video: "5–8 second video placement · poster for now",
    help: "Title, media, destination, timing and order will be controlled by the real admin in the next stage.",
    footer:
      "Services, policies and contact details come from approved store settings",
    scope: "Market",
    mobile: "Mobile version",
    source: "Source: editorial selection; no bestseller or discount claim",
    editorNote:
      "This form is simulated. Server publication schedules and revision history are not implemented.",
    close: "Close",
    zoom: "Full image",
  },
};
type Draft = {
  title: string;
  body: string;
  cta: string;
  group: Group;
  count: number;
  enabled: boolean;
};
type BagItem = { id: string; size: string; color: string; quantity: number };
function App() {
  const [locale, setLocale] = useState<Locale>("fa");
  const [market, setMarket] = useState("IR");
  const t = copy[locale];
  const [route, setRoute] = useState(location.hash.slice(1) || "home");
  const [group, setGroup] = useState<Group>("women");
  const [filter, setFilter] = useState("all");
  const [display, setDisplay] = useState("normal");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("ivory");
  const [bag, setBag] = useState<BagItem[]>([]);
  const [paused, setPaused] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [notice, setNotice] = useState("");
  const [baseline, setBaseline] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    title: "",
    body: "",
    cta: "",
    group: "women",
    count: 5,
    enabled: true,
  });
  const [previous, setPrevious] = useState<Draft | null>(null);
  const [hero, setHero] = useState("");
  useEffect(() => {
    const listener = () => {
      setRoute(location.hash.slice(1) || "home");
      setNotice("");
      setSize("");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    let active = true;
    setHero("");
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
    fetch(`/hero-${locale}.html`)
      .then((r) => (r.ok ? r.text() : ""))
      .then((html) => {
        if (active) setHero(html);
      });
    return () => {
      active = false;
    };
  }, [locale]);
  useEffect(() => {
    if (zoom)
      document.querySelector<HTMLDialogElement>("dialog.d-zoom")?.showModal();
  }, [zoom]);
  const label = (g: Group) => t.groups[groups.indexOf(g)];
  const products = (g: Group) =>
    styleProducts.filter((p) => p[0].startsWith(g + "-"));
  const product =
    styleProducts.find((p) => p[0] === route.split("/")[1]) ?? styleProducts[0];
  const money = (value: string) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
    }).format(Number(value));
  const go = (next: string) => {
    location.hash = next;
  };
  const image = (id: string) => `/assets/v2/${id}.webp`;
  const cards = (g: Group, count = 5) => (
    <div className="d-product-rail">
      {products(g)
        .slice(0, count)
        .map((p) => (
          <article className="d-product" key={p[0]}>
            <a href={`#product/${p[0]}`}>
              <div className="d-product-picture">
                <img src={image(p[0])} alt={p[4][locale]} loading="lazy" />
                <span className="d-demo">{t.artwork}</span>
              </div>
              <div className="d-card-copy">
                <span>{p[4][locale]}</span>
                <bdi>{money(p[3])}</bdi>
              </div>
            </a>
            <div className="d-swatches" aria-label={t.color}>
              <span style={{ background: "#ece3d6" }} />
              <span style={{ background: "#474946" }} />
            </div>
          </article>
        ))}
    </div>
  );
  const heading = (title: string, n: string) => (
    <div className="d-section-heading">
      <div>
        <span className="d-kicker">STYLE HUB / {n}</span>
        <h2>{title}</h2>
      </div>
      <a href={`#category/${group}`}>{t.browse} ↗</a>
    </div>
  );
  const campaign = () =>
    draft.enabled && (
      <section className="d-campaign">
        <img src="/assets/v2/look-women-coat.webp" alt={t.artwork} />
        <div>
          <span className="d-kicker">{t.autumnKicker}</span>
          <h2>{draft.title || t.season}</h2>
          <p>{draft.body || t.seasonBody}</p>
          <a className="d-button" href={`#category/${draft.group}`}>
            {draft.cta || t.browse} ↗
          </a>
          <small>{t.video}</small>
        </div>
        <button className="d-pause" onClick={() => setPaused(!paused)}>
          {paused ? t.play : t.pause}
        </button>
      </section>
    );
  const state = () =>
    display === "normal" ? null : (
      <div className="d-state" role="status">
        {display === "loading" ? (
          <>
            <span className="d-skeleton" />
            {t.loading}
          </>
        ) : (
          <>
            {display === "error" ? t.error : t.noResults}
            <button onClick={() => setDisplay("normal")}>
              {display === "error" ? t.retry : t.reset}
            </button>
          </>
        )}
      </div>
    );
  return (
    <div className={`d-app ${paused ? "d-paused" : ""}`}>
      <div className="d-review-strip">
        <span>{t.demo}</span>
        <select
          aria-label={t.language}
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
        >
          <option value="fa">فارسی</option>
          <option value="tr">Türkçe</option>
          <option value="en">English</option>
        </select>
        <select
          aria-label={t.scope}
          value={market}
          onChange={(e) => setMarket(e.target.value)}
        >
          <option value="IR">IR</option>
          <option value="TR">TR</option>
          <option value="CA">CA</option>
        </select>
        <a href="#editor">{t.editor} ↗</a>
      </div>
      <header className="d-header">
        <a href="#home" className="d-brand">
          STYLE HUB<span>{t.tagline}</span>
        </a>
        <nav aria-label={t.home}>
          <a href="#home">{t.home}</a>
          {groups.map((g) => (
            <a key={g} href={`#category/${g}`}>
              {label(g)}
            </a>
          ))}
        </nav>
        <a className="d-bag-link" href="#bag">
          {t.bag} ({bag.reduce((n, i) => n + i.quantity, 0)})
        </a>
      </header>
      {route === "home" && (
        <>
          <div className="d-baseline-controls">
            <button onClick={() => setBaseline(!baseline)}>
              {baseline ? t.proposal : t.compare}
            </button>
          </div>
          {!baseline && (
            <div
              className="d-approved-hero"
              onClick={(e) => {
                const link = (e.target as Element).closest<HTMLAnchorElement>(
                  "a",
                );
                if (link) {
                  e.preventDefault();
                  go(link.hash.slice(1));
                }
              }}
              dangerouslySetInnerHTML={{ __html: hero }}
            />
          )}
          {baseline ? (
            <section className="d-wrap d-comparison">
              <p>
                {t.compare} · PR60 · {t.demo}
              </p>
              <picture>
                <source
                  media="(min-width:768px)"
                  srcSet={`/current-${locale}-1280.png`}
                />
                <img src={`/current-${locale}-390.png`} alt={t.compare} />
              </picture>
            </section>
          ) : (
            <>
              <section className="d-wrap d-section">
                {heading(t.categories, "01")}
                <div className="d-category-grid">
                  {groups.map((g, i) => (
                    <a
                      href={`#category/${g}`}
                      className={`d-category d-category-${i}`}
                      key={g}
                    >
                      <img
                        src={`/assets/${["coat", "shirt", "kids", "bag"][i]}.webp`}
                        alt={t.artwork}
                      />
                      <span className="d-category-number">0{i + 1}</span>
                      <div>
                        <span>{t.artwork}</span>
                        <h3>{label(g)}</h3>
                        <p>{t.browse} ↗</p>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
              <section className="d-wrap d-dual">
                {t.dual.map((title, i) => (
                  <a key={title} href={`#category/${i ? "men" : "women"}`}>
                    <img
                      src={`/assets/v2/${i ? "look-men" : "look-women-knit"}.webp`}
                      alt={t.artwork}
                    />
                    <div>
                      <span className="d-kicker">{t.collectionKicker}</span>
                      <h2>{title}</h2>
                      <span>{t.browse} ↗</span>
                      <small>{t.artwork}</small>
                    </div>
                  </a>
                ))}
              </section>
              <section className="d-wrap d-section">
                {heading(t.latest, "02")}
                <div className="d-tabs">
                  {groups.map((g) => (
                    <button
                      key={g}
                      aria-pressed={group === g}
                      onClick={() => setGroup(g)}
                    >
                      {label(g)}
                    </button>
                  ))}
                </div>
                {cards(group, draft.count)}
              </section>
              <div className="d-wrap">{campaign()}</div>
              <section className="d-wrap d-section">
                {heading(t.week, "03")}
                <p className="d-subtitle">{t.source}</p>
                {cards("accessories")}
              </section>
              <section className="d-wrap d-look">
                <div className="d-look-picture">
                  <img src="/assets/v2/look-women-knit.webp" alt={t.artwork} />
                  <span className="d-demo">{t.artwork}</span>
                  <a
                    className="d-look-dot d-dot-one"
                    href="#product/women-knit"
                  >
                    ＋ <span>{products("women")[3][4][locale]}</span>
                  </a>
                  <a
                    className="d-look-dot d-dot-two"
                    href="#product/women-trousers"
                  >
                    ＋ <span>{products("women")[1][4][locale]}</span>
                  </a>
                </div>
                <div>
                  <span className="d-kicker">{t.styleKicker} / 04</span>
                  <h2>{t.looks}</h2>
                  <p>{t.lookBody}</p>
                  <a className="d-button" href="#product/women-knit">
                    {t.browse} ↗
                  </a>
                </div>
              </section>
            </>
          )}
        </>
      )}
      {route.startsWith("category") &&
        (() => {
          const g = (route.split("/")[1] || "women") as Group;
          const list = products(groups.includes(g) ? g : "women");
          return (
            <main className="d-wrap d-section">
              <p className="d-breadcrumb">
                <a href="#home">{t.home}</a> / {label(g)}
              </p>
              <div className="d-category-intro">
                <div>
                  <span className="d-kicker">{t.collectionKicker}</span>
                  <h1>{label(g)}</h1>
                  <p>{t.discover}</p>
                </div>
                <img src={image(list[0][0])} alt={t.artwork} />
              </div>
              <div className="d-filterbar">
                <label>
                  {t.filter}
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">{t.all}</option>
                    <option value="ivory">{t.ivory}</option>
                    <option value="empty">{t.charcoal}</option>
                  </select>
                </label>
                <label>
                  {t.state}
                  <select
                    value={display}
                    onChange={(e) => setDisplay(e.target.value)}
                  >
                    <option value="normal">{t.all}</option>
                    <option value="loading">{t.loading}</option>
                    <option value="error">{t.error}</option>
                  </select>
                </label>
                <button
                  onClick={() => {
                    setFilter("all");
                    setDisplay("normal");
                  }}
                >
                  {t.reset}
                </button>
              </div>
              {state()}
              {display === "normal" &&
                (filter === "empty" ? (
                  <div className="d-state">
                    {t.noResults}
                    <button onClick={() => setFilter("all")}>{t.reset}</button>
                  </div>
                ) : (
                  cards(g)
                ))}
            </main>
          );
        })()}
      {route.startsWith("product") && (
        <main className="d-wrap d-section">
          <p className="d-breadcrumb">
            <a href="#home">{t.home}</a> /{" "}
            <a href={`#category/${product[0].split("-")[0]}`}>
              {label(product[0].split("-")[0] as Group)}
            </a>
          </p>
          <div className="d-pdp">
            <div className="d-gallery">
              <button aria-label={t.zoom} onClick={() => setZoom(true)}>
                <img src={image(product[0])} alt={product[4][locale]} />
                <span>{t.zoom} ↗</span>
              </button>
              <span className="d-demo">{t.artwork}</span>
              <div className="d-thumbnails">
                {[product[0], product[0], product[0]].map((id, i) => (
                  <button
                    key={i}
                    onClick={() => setZoom(true)}
                    aria-label={`${t.zoom} ${i + 1}`}
                  >
                    <img src={image(id)} alt="" />
                  </button>
                ))}
              </div>
            </div>
            <div className="d-purchase">
              <span className="d-kicker">{t.collectionKicker}</span>
              <h1>{product[4][locale]}</h1>
              <p className="d-price">
                <bdi>{money(product[3])}</bdi>
              </p>
              <p>{t.color}</p>
              <div className="d-choice">
                {["ivory", "charcoal"].map((c) => (
                  <button
                    key={c}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                  >
                    {c === "ivory" ? t.ivory : t.charcoal}
                  </button>
                ))}
              </div>
              <p>{t.size}</p>
              <div className="d-choice">
                {["S", "M", "L", "XL"].map((s) => (
                  <button
                    key={s}
                    aria-pressed={size === s}
                    onClick={() => setSize(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <button
                className="d-button d-buy"
                onClick={() => {
                  if (!size) {
                    setNotice(t.choose);
                    return;
                  }
                  setBag((items) => {
                    const found = items.find(
                      (i) =>
                        i.id === product[0] &&
                        i.size === size &&
                        i.color === color,
                    );
                    return found
                      ? items.map((i) =>
                          i === found ? { ...i, quantity: i.quantity + 1 } : i,
                        )
                      : [
                          ...items,
                          { id: product[0], size, color, quantity: 1 },
                        ];
                  });
                  setNotice(t.selected);
                }}
              >
                {t.add}
              </button>
              <p role="status">{notice}</p>
              <details open>
                <summary>{t.details}</summary>
                <p>{t.detailText}</p>
              </details>
              <a href="#bag">{t.bag} ↗</a>
            </div>
          </div>
        </main>
      )}
      {route === "bag" && (
        <main className="d-wrap d-section">
          <h1>{t.bag}</h1>
          {!bag.length ? (
            <div className="d-state">
              <h2>{t.empty}</h2>
              <a className="d-button" href="#home">
                {t.browse}
              </a>
            </div>
          ) : (
            <div className="d-bag-grid">
              <div>
                {bag.map((item, index) => {
                  const p = styleProducts.find((p) => p[0] === item.id)!;
                  return (
                    <article
                      className="d-bag-item"
                      key={`${item.id}-${item.size}-${item.color}`}
                    >
                      <a href={`#product/${item.id}`}>
                        <img src={image(item.id)} alt={p[4][locale]} />
                      </a>
                      <div>
                        <h2>{p[4][locale]}</h2>
                        <p>
                          {item.size} /{" "}
                          {item.color === "ivory" ? t.ivory : t.charcoal}
                        </p>
                        <bdi>{money(p[3])}</bdi>
                        <label>
                          {t.quantity}
                          <input
                            type="number"
                            min="1"
                            max="9"
                            value={item.quantity}
                            onChange={(e) =>
                              setBag(
                                bag.map((v, i) =>
                                  i === index
                                    ? {
                                        ...v,
                                        quantity: Math.max(
                                          1,
                                          Math.min(
                                            9,
                                            Number(e.target.value) || 1,
                                          ),
                                        ),
                                      }
                                    : v,
                                ),
                              )
                            }
                          />
                        </label>
                        <button
                          onClick={() =>
                            setBag(bag.filter((_, i) => i !== index))
                          }
                        >
                          {t.remove}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <aside className="d-summary">
                <h2>{t.summary}</h2>
                <p>
                  {t.total}
                  <bdi>
                    {money(
                      bag
                        .reduce(
                          (sum, i) =>
                            sum.add(
                              new Decimal(
                                styleProducts.find((p) => p[0] === i.id)![3],
                              ).mul(i.quantity),
                            ),
                          new Decimal(0),
                        )
                        .toFixed(2),
                    )}
                  </bdi>
                </p>
                <p>{t.demo}</p>
                <button
                  className="d-button"
                  onClick={() => setNotice(t.mockCheckout)}
                >
                  {t.checkout}
                </button>
                <p role="status">{notice}</p>
              </aside>
            </div>
          )}
        </main>
      )}
      {route === "editor" && (
        <main className="d-wrap d-section">
          <h1>{t.panel}</h1>
          <p>{t.editorNote}</p>
          <div className="d-editor-grid">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPrevious(draft);
                localStorage.setItem(
                  "hoda-design01-draft",
                  JSON.stringify(draft),
                );
                setNotice(t.saved);
              }}
            >
              <label>
                {t.title}
                <input
                  value={draft.title}
                  placeholder={t.season}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </label>
              <label>
                {t.body}
                <textarea
                  value={draft.body}
                  placeholder={t.seasonBody}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                />
              </label>
              <label>
                {t.cta}
                <input
                  value={draft.cta}
                  placeholder={t.browse}
                  onChange={(e) => setDraft({ ...draft, cta: e.target.value })}
                />
              </label>
              <label>
                {t.target}
                <select
                  value={draft.group}
                  onChange={(e) =>
                    setDraft({ ...draft, group: e.target.value as Group })
                  }
                >
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {label(g)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.count}
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={draft.count}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      count: Math.max(
                        1,
                        Math.min(5, Number(e.target.value) || 1),
                      ),
                    })
                  }
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) =>
                    setDraft({ ...draft, enabled: e.target.checked })
                  }
                />
                {t.enabled}
              </label>
              <button className="d-button" type="submit">
                {t.save}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (previous) setDraft(previous);
                  else {
                    const saved = localStorage.getItem("hoda-design01-draft");
                    if (saved) setDraft(JSON.parse(saved));
                  }
                }}
              >
                {t.rollback}
              </button>
              <p role="status">{notice}</p>
              <p className="d-subtitle">{t.help}</p>
            </form>
            <div className="d-editor-preview">
              {campaign()}
              {cards(draft.group, draft.count)}
            </div>
          </div>
        </main>
      )}
      <section className="d-services d-wrap">
        {t.services.map((s, i) => (
          <div key={s}>
            <span>0{i + 1}</span>
            <h3>{s}</h3>
            <p>{t.footer}</p>
          </div>
        ))}
      </section>
      <footer className="d-footer">
        <div className="d-wrap">
          <div className="d-footer-brand">
            <b>STYLE HUB</b>
            <p>{t.newsletter}</p>
          </div>
          <div>
            <h3>{t.info}</h3>
            {t.services.map((s) => (
              <details key={s}>
                <summary>{s}</summary>
                <p>{t.footer}</p>
              </details>
            ))}
          </div>
          <div>
            <h3>{t.categories}</h3>
            {groups.map((g) => (
              <a key={g} href={`#category/${g}`}>
                {label(g)}
              </a>
            ))}
          </div>
        </div>
        <small>{t.demo} · DESIGN-01.1</small>
      </footer>
      <nav className="d-bottom" aria-label={t.home}>
        <a href="#home">
          ⌂<span>{t.home}</span>
        </a>
        <a href={`#category/${group}`}>
          ◇<span>{t.filter}</span>
        </a>
        <a href="#bag">
          ▢
          <span>
            {t.bag} ({bag.length})
          </span>
        </a>
        <a href="#editor">
          ≡<span>{t.editor}</span>
        </a>
      </nav>
      {zoom && (
        <dialog
          className="d-zoom"
          aria-label={t.zoom}
          onCancel={() => setZoom(false)}
        >
          <button autoFocus onClick={() => setZoom(false)}>
            {t.close} ×
          </button>
          <img src={image(product[0])} alt={product[4][locale]} />
        </dialog>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
