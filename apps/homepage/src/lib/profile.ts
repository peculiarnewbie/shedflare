type AppConfig = {
  name: string;
  nickname: string;
  title: string;
  tagline: string;
  bio: string[];
  socials: Array<{ platform: string; url: string }>;
  siteTitle: string;
};

const FALLBACK: AppConfig = {
  name: "Your Name",
  nickname: "",
  title: "Developer",
  tagline: "",
  bio: [],
  socials: [],
  siteTitle: "Homepage",
};

const AppConfigOverridesSchema = object({
  name: optional(string()),
  nickname: optional(string()),
  title: optional(string()),
  tagline: optional(string()),
  bio: optional(array(string())),
  socials: optional(array(object({ platform: string(), url: string() }))),
  siteTitle: optional(string()),
});
const overrides = safeParse(AppConfigOverridesSchema, import.meta.env.VITE_APP_CONFIG);

export const PROFILE: AppConfig = {
  ...FALLBACK,
  ...(overrides.success ? overrides.output : FALLBACK),
};
import { array, object, optional, safeParse, string } from "valibot";
