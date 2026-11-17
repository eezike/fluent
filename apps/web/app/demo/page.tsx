"use client";
import { DemoApp } from "@fluent/ui";

/** Public demo on sample data. No sign-in, no network calls to the API, no model calls. */
export default function DemoPage() {
  return (
    <div className="shell">
      <DemoApp onExit={() => { window.location.href = "/"; }} />
    </div>
  );
}
