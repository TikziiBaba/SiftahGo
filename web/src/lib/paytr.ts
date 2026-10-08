import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// PayTR iFrame API: https://dev.paytr.com/iframe-api
const MERCHANT_ID = process.env.PAYTR_MERCHANT_ID ?? "";
const MERCHANT_KEY = process.env.PAYTR_MERCHANT_KEY ?? "";
const MERCHANT_SALT = process.env.PAYTR_MERCHANT_SALT ?? "";
const TEST_MODE = process.env.PAYTR_TEST_MODE === "1" ? "1" : "0";

export const paytrConfigured = () => Boolean(MERCHANT_ID && MERCHANT_KEY && MERCHANT_SALT);

const hmac = (data: string) => createHmac("sha256", MERCHANT_KEY).update(data, "utf8").digest("base64");

type TokenInput = {
  merchantOid: string;
  amount: number; // TL
  productName: string;
  email: string;
  userIp: string;
  userName: string;
  userAddress: string;
  userPhone: string;
  okUrl: string;
  failUrl: string;
};

/** Ödeme ekranı (iframe) için PayTR'den token alır. */
export async function getPaytrToken(input: TokenInput): Promise<{ token: string } | { error: string }> {
  const paymentAmount = String(Math.round(input.amount * 100));
  const basket = Buffer.from(JSON.stringify([[input.productName, input.amount.toFixed(2), 1]])).toString("base64");
  const noInstallment = "1";
  const maxInstallment = "0";
  const currency = "TL";

  const hashStr =
    MERCHANT_ID + input.userIp + input.merchantOid + input.email + paymentAmount + basket + noInstallment + maxInstallment + currency + TEST_MODE;

  const body = new URLSearchParams({
    merchant_id: MERCHANT_ID,
    user_ip: input.userIp,
    merchant_oid: input.merchantOid,
    email: input.email,
    payment_amount: paymentAmount,
    paytr_token: hmac(hashStr + MERCHANT_SALT),
    user_basket: basket,
    debug_on: "1",
    no_installment: noInstallment,
    max_installment: maxInstallment,
    user_name: input.userName.slice(0, 60),
    user_address: input.userAddress.slice(0, 400),
    user_phone: input.userPhone.slice(0, 20),
    merchant_ok_url: input.okUrl,
    merchant_fail_url: input.failUrl,
    timeout_limit: "30",
    currency,
    test_mode: TEST_MODE,
    lang: "tr",
  });

  const res = await fetch("https://www.paytr.com/odeme/api/get-token", { method: "POST", body });
  const json = (await res.json()) as { status: string; token?: string; reason?: string };
  if (json.status === "success" && json.token) return { token: json.token };
  return { error: json.reason ?? "PayTR ödeme başlatılamadı." };
}

/** PayTR bildirimindeki imzayı doğrular. */
export function verifyPaytrCallback(p: { merchant_oid: string; status: string; total_amount: string; hash: string }) {
  const expected = Buffer.from(hmac(p.merchant_oid + MERCHANT_SALT + p.status + p.total_amount));
  const given = Buffer.from(p.hash ?? "");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
