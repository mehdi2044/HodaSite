export default function Login() {
  return (
    <section className="card" style={{ maxWidth: 420, margin: "10vh auto" }}>
      <h1>ورود مدیر</h1>
      <form className="grid">
        <label>
          ایمیل
          <input className="input" type="email" required />
        </label>
        <label>
          رمز عبور
          <input className="input" type="password" required />
        </label>
        <button className="button">ورود امن</button>
      </form>
    </section>
  );
}
