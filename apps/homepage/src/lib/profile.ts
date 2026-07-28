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

export const PROFILE: AppConfig = {
  ...FALLBACK,
  ...(import.meta.env.VITE_APP_CONFIG as Partial<AppConfig>),
};
