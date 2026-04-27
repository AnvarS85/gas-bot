import { Bot, webhookCallback } from "grammy";
import { registerBot } from "@/lib/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bot = new Bot(process.env.BOT_TOKEN);

await registerBot(bot);

export const POST = webhookCallback(bot, "std/http");