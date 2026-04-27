import { sql } from "@vercel/postgres";
import { distanceKm, mapsLink } from "./geo";
import { initDb } from "./db";

const sessions = new Map();

export async function registerBot(bot) {
  await initDb();

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Welcome to Gas Bot.\n\n/ownerkey <key> - approve owner\n/addstation - post daily fuel price\n/search - find nearby cheapest stations"
    );
  });

  bot.command("ownerkey", async (ctx) => {
    const key = ctx.message?.text.split(" ").slice(1).join(" ").trim();
    if (!key) return ctx.reply("Send: /ownerkey YOUR_KEY");
    if (key !== process.env.OWNER_KEY) return ctx.reply("Invalid owner key.");

    const telegramId = String(ctx.from.id);

    await sql`
      INSERT INTO owners (telegram_id, approved)
      VALUES (${telegramId}, 1)
      ON CONFLICT (telegram_id) DO UPDATE SET approved = 1
    `;

    await ctx.reply("Owner approved. Use /addstation.");
  });

  bot.command("addstation", async (ctx) => {
    const telegramId = String(ctx.from.id);
    const { rows } = await sql`
      SELECT approved FROM owners WHERE telegram_id = ${telegramId}
    `;

    if (!rows.length || rows[0].approved !== 1) {
      return ctx.reply("You are not approved as an owner.");
    }

    sessions.set(String(ctx.chat.id), { step: "station_name", telegramId });
    await ctx.reply("Send station name.");
  });

  bot.command("search", async (ctx) => {
    sessions.set(String(ctx.chat.id), { step: "user_location" });
    await ctx.reply("Share your location to find nearby stations.", {
      reply_markup: {
        keyboard: [[{ text: "Share location", request_location: true }]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  });

  bot.on("message:text", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const session = sessions.get(chatId);
    if (!session) return;
    if (ctx.message.text.startsWith("/")) return;

    if (session.step === "station_name") {
      session.station_name = ctx.message.text.trim();
      session.step = "fuel_type";
      sessions.set(chatId, session);
      return ctx.reply("Send fuel type.");
    }

    if (session.step === "fuel_type") {
      session.fuel_type = ctx.message.text.trim();
      session.step = "price";
      sessions.set(chatId, session);
      return ctx.reply("Send price as a number.");
    }

    if (session.step === "price") {
      const price = Number(ctx.message.text);
      if (Number.isNaN(price)) return ctx.reply("Invalid price.");
      session.price = price;
      session.step = "station_location";
      sessions.set(chatId, session);

      return ctx.reply("Share station location.", {
        reply_markup: {
          keyboard: [[{ text: "Share station location", request_location: true }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
    }
  });

  bot.on("message:location", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const session = sessions.get(chatId);
    if (!session) return;

    if (session.step === "station_location") {
      const { latitude, longitude } = ctx.message.location;

      await sql`
        INSERT INTO stations (
          owner_telegram_id, station_name, fuel_type, price,
          latitude, longitude, created_at, active
        )
        VALUES (
          ${session.telegramId},
          ${session.station_name},
          ${session.fuel_type},
          ${session.price},
          ${latitude},
          ${longitude},
          NOW(),
          1
        )
      `;

      sessions.delete(chatId);
      return ctx.reply("Station saved for today.");
    }

    if (session.step === "user_location") {
      const userLat = ctx.message.location.latitude;
      const userLng = ctx.message.location.longitude;

      const { rows } = await sql`SELECT * FROM stations WHERE active = 1`;

      const results = rows
        .map((s) => ({
          ...s,
          distance: distanceKm(userLat, userLng, s.latitude, s.longitude)
        }))
        .filter((s) => s.distance <= 30)
        .sort((a, b) => a.price - b.price || a.distance - b.distance)
        .slice(0, 5);

      sessions.delete(chatId);

      if (!results.length) {
        return ctx.reply("No nearby stations found within 30 km.");
      }

      const text = results.map((s, i) => {
        return [
          `${i + 1}. ${s.station_name}`,
          `Fuel: ${s.fuel_type}`,
          `Price: ${s.price}`,
          `Distance: ${s.distance.toFixed(1)} km`,
          `Map: ${mapsLink(s.latitude, s.longitude)}`
        ].join("\n");
      }).join("\n\n");

      return ctx.reply(`Cheapest nearby stations:\n\n${text}`, {
        disable_web_page_preview: true
      });
    }
  });
}