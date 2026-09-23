import { Nav } from "../ui";
import { BacktestForm } from "./form";

export const maxDuration = 60;

export default function BacktestPage() {
  return (
    <>
      <Nav />
      <main>
        <div className="card">
          <h2>Test the bot on past prices</h2>
          <p className="muted">
            This replays history hour by hour with exactly the same rules the live bot uses, including fees. The bot never sees
            &quot;future&quot; prices. Good past results do not guarantee future profit.
          </p>
          <BacktestForm />
        </div>
      </main>
    </>
  );
}
