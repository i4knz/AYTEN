import { afterAll, beforeEach } from "vitest";
import { closeDb } from "@/server/db/client";
import { setEmailProvider } from "@/server/email";
import { outbox, resetDatabase } from "./db";

beforeEach(async () => {
  await resetDatabase();
  outbox.length = 0;
  setEmailProvider({ send: async (m) => void outbox.push(m) });
});

afterAll(async () => {
  await closeDb();
});
