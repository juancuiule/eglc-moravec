import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  preview: {
    // Lets this be reached from other devices on the local network by the
    // Pi's mDNS hostname (e.g. testing from a phone during local/self-hosted
    // deploy checks), not just localhost.
    allowedHosts: ["raspberrypi.local"],
  },
});
