const API = "https://api.telegram.org";

export async function sendTelegram(chatId: string | null | undefined, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  try {
    await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    // Alerts must never break trading.
  }
}

// Finds the chat of whoever most recently messaged the bot.
export async function findLatestChatId(): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set in Vercel");
  const res = await fetch(`${API}/bot${token}/getUpdates`, { cache: "no-store" });
  const json = (await res.json()) as { ok: boolean; result: { message?: { chat: { id: number } } }[] };
  if (!json.ok) throw new Error("Telegram rejected the bot token");
  const withChat = json.result.filter((u) => u.message?.chat?.id);
  const last = withChat[withChat.length - 1];
  return last ? String(last.message!.chat.id) : null;
}
