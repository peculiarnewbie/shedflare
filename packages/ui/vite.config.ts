import { defineConfig } from "vite-plus";
import solid from "vite-plugin-solid";

const port = Number(process.env.UI_DEV_PORT ?? 5175);
const isTest = !!process.env.VITEST;

export default defineConfig({
  root: isTest ? "." : "dev",
  plugins: [solid()],
  server: {
    port,
    strictPort: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  lint: { options: { typeAware: true, typeCheck: true } },
});
