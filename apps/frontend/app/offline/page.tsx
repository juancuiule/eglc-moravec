import { OfflineRouter } from "@/components/OfflineRouter";

// The service worker precaches this document at install and serves it for
// any navigation that has neither network nor a per-URL cached page — like
// a rewrite, the requested URL stays in the address bar while this document
// renders. Its client code routes by location.pathname (see OfflineRouter).
export default function OfflinePage() {
  return <OfflineRouter />;
}
