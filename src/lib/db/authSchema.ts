import { pgSchema, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
export const authIdentity = pgSchema("auth").table("users", {
  id: uuid().primaryKey(), email: text(), encryptedPassword: text("encrypted_password"),
  emailConfirmedAt: timestamp("email_confirmed_at", { withTimezone: true }),
  rawUserMetaData: jsonb("raw_user_meta_data").$type<{ full_name?: string; name?: string; avatar_url?: string }>(),
});
