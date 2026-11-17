import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import type { ApiOptions, PageContext } from "@fluent/shared";
import { FluentApp, SignIn } from "@fluent/ui";

// Keep the Supabase session in chrome.storage so it survives the panel closing.
const storage = {
  getItem: async (k: string): Promise<string | null> => ((await chrome.storage.local.get(k))[k] as string | undefined) ?? null,
  setItem: (k: string, v: string) => chrome.storage.local.set({ [k]: v }),
  removeItem: (k: string) => chrome.storage.local.remove(k),
};
const sb = createClient(__SUPABASE_URL__ || "http://invalid.local", __SUPABASE_ANON_KEY__ || "x", {
  auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
const api: ApiOptions = {
  baseUrl: __API_URL__,
  getToken: async () => (await sb.auth.getSession()).data.session?.access_token ?? null,
};

/** Text of the tab you're looking at. Works on Gmail always, and on other tabs after you click the toolbar icon. */
async function readPage(): Promise<PageContext | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) return null;
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        url: location.href,
        title: document.title,
        text: (document.body?.innerText ?? "").slice(0, 20000),
      }),
    });
    return (res?.result as PageContext) ?? null;
  } catch {
    return null;
  }
}

function Panel() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  const getPage = useCallback(readPage, []);

  if (session === undefined) return null;
  if (!session)
    return (
      <SignIn
        hint="Sign in with your Fluent account. Create one in the web app first."
        onSignIn={async (email, password) => (await sb.auth.signInWithPassword({ email, password })).error?.message ?? null}
      />
    );
  return <FluentApp api={api} layout="panel" getPage={getPage} />;
}

createRoot(document.getElementById("root")!).render(<Panel />);
