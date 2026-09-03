export default function Dashboard() {
  return (
    <>
      <h1>داشبورد</h1>
      <p className="muted">
        نمای کلی کسب‌وکار — داده‌ها در فازهای بعدی نمایش داده می‌شوند.
      </p>
      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}
      >
        {["فروش امروز", "سفارش‌ها", "مشتریان"].map((x) => (
          <div className="card" key={x}>
            <small>{x}</small>
            <h2>—</h2>
            <span className="muted">هنوز داده‌ای نیست</span>
          </div>
        ))}
      </div>
    </>
  );
}
