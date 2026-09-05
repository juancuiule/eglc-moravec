import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import {
  isLocale,
  localeFromAcceptLanguage,
  LOCALE_COOKIE,
  type Locale,
} from "./locale";
import enMessages from "../../messages/en/index";
import esMessages from "../../messages/es/index";

const MESSAGES: Record<Locale, typeof enMessages> = {
  en: enMessages,
  es: esMessages,
};

// No locale-prefixed routing (see the i18n grill session, Q3) — every
// request resolves its locale here, from the persisted cookie or (only
// before that cookie ever gets set) the browser's Accept-Language header.
export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale)
    ? cookieLocale
    : localeFromAcceptLanguage((await headers()).get("accept-language"));

  return { locale, messages: MESSAGES[locale] };
});
