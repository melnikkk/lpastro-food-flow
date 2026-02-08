/// <reference types="astro/client" />

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {
    runtime?: {
      env?: {
        GOOGLE_SHEET_ID?: string;
        GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
        GOOGLE_PRIVATE_KEY?: string;
      };
    };
  }
}
