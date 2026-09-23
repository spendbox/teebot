import { login } from "../actions";
import { Message } from "../ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  return (
    <main style={{ maxWidth: 380, paddingTop: 80 }}>
      <div className="card">
        <h2>Teebot login</h2>
        <Message msg={msg} />
        <form action={login} className="row">
          <input type="password" name="password" placeholder="Dashboard password" required autoFocus style={{ flex: 1 }} />
          <button className="primary" type="submit">
            Log in
          </button>
        </form>
      </div>
    </main>
  );
}
