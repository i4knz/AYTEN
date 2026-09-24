import { afterAll, beforeEach } from "vitest";
import { closeDb } from "@/server/db/client";
import { setEmailProvider } from "@/server/email";
import { setStorage } from "@/server/storage";
import { memoryStorage, outbox, resetDatabase } from "./db";

beforeEach(async () => {
  await resetDatabase();
  outbox.length = 0;
  setEmailProvider({ send: async (m) => void outbox.push(m) });
  memoryStorage.files.clear();
  setStorage(memoryStorage);
});

afterAll(async () => {
  await closeDb();
});
