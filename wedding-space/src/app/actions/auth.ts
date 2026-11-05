"use server";

import { redirect } from "next/navigation";
import { one, query, tx } from "@/lib/db";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/auth/password";
import { clear, hit, isLimited, LOGIN_PER_EMAIL, LOGIN_PER_IP, RESET_PER_IP } from "@/lib/auth/rate-limit";
import { clientIp, endAllSessions, endSession, homeFor, startSession } from "@/lib/auth/session";
import { createAccountLink, useAccountLink } from "@/lib/data/accounts";
import { logActivity } from "@/lib/data/couples";
import { sendMail } from "@/lib/mail";
import { done, str } from "@/lib/redirect";
import type { Account } from "@/lib/types";

export async function login(formData: FormData) {
  const email = str(formData, "email", 200).toLowerCase();
  const password = String(formData.get("password") ?? "").slice(0, 200);
  const emailKey = `login:email:${email}`;
  const ipKey = `login:ip:${await clientIp()}`;
  if (isLimited(emailKey, LOGIN_PER_EMAIL) || isLimited(ipKey, LOGIN_PER_IP)) {
    done("/login", "Te veel inlogpogingen. Wacht een kwartier, of kies Wachtwoord vergeten.", true);
  }
  // Couples can only sign in once Sabine has shared their portal.
  const account = await one<Account>(
    `select a.* from accounts a left join couples c on c.id = a.couple_id
      where a.email = $1 and (a.role = 'admin' or c.status = 'active')`,
    [email],
  );
  if (!verifyPassword(password, account?.password_hash ?? null)) {
    hit(emailKey, LOGIN_PER_EMAIL);
    hit(ipKey, LOGIN_PER_IP);
    done("/login", "Onbekend e-mailadres of onjuist wachtwoord.", true);
  }
  clear(emailKey);
  await startSession(account!.id);
  if (account!.couple_id) await logActivity(account!.couple_id, account!.id, "Ingelogd");
  redirect(homeFor(account!));
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function requestReset(formData: FormData) {
  const email = str(formData, "email", 200).toLowerCase();
  const ipKey = `reset:ip:${await clientIp()}`;
  if (!isLimited(ipKey, RESET_PER_IP) && /^\S+@\S+\.\S+$/.test(email)) {
    hit(ipKey, RESET_PER_IP);
    const account = await one<Account>(
      `select a.* from accounts a left join couples c on c.id = a.couple_id
        where a.email = $1 and (a.role = 'admin' or c.status = 'active')`,
      [email],
    );
    if (account) {
      const link = await createAccountLink(account.id, account.password_hash ? "reset" : "invite");
      await sendMail({
        to: account.email,
        subject: "Nieuw wachtwoord voor Your Wedding Space",
        text: `Hoi ${account.name.split(" ")[0]},\n\nVia deze link kies je een nieuw wachtwoord voor Your Wedding Space. De link werkt één keer en is 24 uur geldig.\n\n${link}\n\nHeb je dit niet zelf aangevraagd? Dan kun je deze mail negeren.`,
      });
    }
  }
  // Same answer whether or not the address exists.
  done("/wachtwoord-vergeten", "Als dit e-mailadres bij ons bekend is, ontvang je een link om een nieuw wachtwoord te kiezen.");
}

export async function choosePassword(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const path = `/activeren/${encodeURIComponent(token)}`;
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) done(path, `Kies een wachtwoord van minimaal ${MIN_PASSWORD_LENGTH} tekens.`, true);
  if (password.length > 200) done(path, "Kies een wachtwoord van maximaal 200 tekens.", true);
  if (password !== String(formData.get("confirm") ?? "")) done(path, "De wachtwoorden komen niet overeen.", true);

  const accountId = await tx(async (db) => {
    const id = await useAccountLink(token, db);
    if (id) await query("update accounts set password_hash = $1 where id = $2", [hashPassword(password), id], db);
    return id;
  });
  if (!accountId) done(path, "Deze link is verlopen of al gebruikt. Vraag een nieuwe link aan.", true);

  // A new password logs out every other device.
  await endAllSessions(accountId);
  await startSession(accountId);
  const account = await one<Account>("select * from accounts where id = $1", [accountId]);
  if (account?.couple_id) await logActivity(account.couple_id, account.id, "Wachtwoord ingesteld");
  redirect(homeFor(account!));
}
