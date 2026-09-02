export default function Design() {
  return (
    <>
      <h1>سیستم طراحی</h1>
      <div className="card grid">
        <button className="button">دکمه</button>
        <input className="input" placeholder="ورودی" />
        <select className="input">
          <option>انتخاب</option>
        </select>
        <span
          style={{
            background: "var(--success)",
            color: "white",
            padding: 8,
            borderRadius: 99,
          }}
        >
          نشان موفق
        </span>
        <table>
          <tbody>
            <tr>
              <td>جدول</td>
              <td>نمونه</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
