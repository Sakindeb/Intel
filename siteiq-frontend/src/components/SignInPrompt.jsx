
/**
 * SignInPrompt — three modes:
 *
 * 1. <SignInPrompt type="modal" .../>
 *    Full-screen modal shown after first pin results load (Option A).
 *    Triggered once per session, cancellable.
 *
 * 2. <SignInPrompt type="cta" .../>
 *    Inline card shown in the empty panel placeholder (Option D).
 *
 * 3. <SignInPrompt type="tooltip" trigger={<element/>} .../>
 *    Popover shown on hover over locked items (Option C).
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";


function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

import {
  CircleCheckBig,
  FileText,
  Map,
  FolderOpen,
} from "lucide-react";

const PERKS = [
  { icon: <CircleCheckBig />, label: "Save analyses and revisit them any time" },
  { icon: <FileText />, label: "Export full 4-page site reports as PDF" },
  { icon: <Map />, label: "Unlock infrastructure and land cover overlays" },
  { icon: <FolderOpen />, label: "Manage multiple sites in one place" },
];

function SignInButton({ label = "Sign in with Google", size = "md" }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: import.meta.env.VITE_APP_URL || window.location.origin },
    });
  }

  const pad = size === "sm" ? "7px 14px" : "10px 20px";
  const fz  = size === "sm" ? 12 : 14;

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        padding: pad, background: loading ? "#6b7280" : "#1f2937",
        color: "#fff", border: "none", borderRadius: 8,
        fontSize: fz, fontFamily: "var(--font-body)", fontWeight: 600,
        cursor: loading ? "default" : "pointer",
        width: "100%", transition: "background 0.15s",
      }}
    >
      {!loading && <GoogleIcon />}
      {loading ? "Redirecting…" : label}
    </button>
  );
}

// ── Option A: Full-screen modal ────────────────────────────────────────────

export function SignInModal({ open, onClose }) {
  if (!open) return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 14,
          padding: "32px 28px", width: "min(440px, 100%)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
          position: "relative",
        }}
      >
        {/* Dismiss */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 14, right: 14,
            background: "#f3f4f6", border: "none", borderRadius: 6,
            padding: "4px 9px", fontSize: 13, color: "#6b7280",
            cursor: "pointer", fontFamily: "var(--font-body)",
          }}
        >
          Not now
        </button>

        {/* Heading */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <p style={{ fontSize: 28, margin: "0 0 8px" }}>📍</p>
          <h2 style={{
            margin: "0 0 6px", fontSize: 20, fontWeight: 700,
            color: "#111827", fontFamily: "var(--font-body)",
          }}>
            Save your analysis
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
            Create a free account to unlock the full platform.
            No password needed — just your Google account.
          </p>
        </div>

        {/* Perks */}
        <div style={{
          background: "#f9fafb", borderRadius: 10,
          padding: "14px 16px", marginBottom: 20,
          border: "1px solid #e5e7eb",
        }}>
          {PERKS.map(({ icon, label }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "5px 0", fontSize: 13, color: "#374151",
            }}>
              <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{icon}</span>
              {label}
            </div>
          ))}
        </div>

        <SignInButton label="Continue with Google" size="lg" />

        <p style={{
          margin: "12px 0 0", fontSize: 10, color: "#9ca3af",
          textAlign: "center", lineHeight: 1.5,
        }}>
          Free forever for site analysis. No credit card required.
        </p>
      </div>
    </div>,
    document.body
  );
}

// ── Option D: Inline CTA card ──────────────────────────────────────────────

export function SignInCTA({ onDismiss }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  function handleDismiss() {
    setVisible(false);
    if (onDismiss) onDismiss();
  }

  return (
    <div style={{
      marginTop: 16, padding: "16px",
      border: "1px solid #e5e7eb", borderRadius: 10,
      background: "#f9fafb", position: "relative",
    }}>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss sign in prompt"
        style={{
          position: "absolute", top: 0, right: 5,
          border: "none", background: "transparent",
          color: "#6b7280", fontSize: 18, cursor: "pointer",
          padding: 4,
        }}
      >
        ×
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 15 }}>{<CircleCheckBig />}</span>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827" }}>
          Create a free account to unlock all features.
        </p>
      </div>
      <SignInButton label="Sign in with Google" size="sm" />
    </div>
  );
}

// ── Option C: Lock tooltip popover ────────────────────────────────────────

export function LockTooltip({ label, children }) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      style={{ position: "relative", display: "inline-block", width: "100%" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}

      {visible && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", right: 0,
          background: "#1f2937", color: "#fff", borderRadius: 8,
          padding: "10px 12px", fontSize: 12, lineHeight: 1.5,
          width: 220, zIndex: 2500,
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          pointerEvents: "none",
        }}>
          <p style={{ margin: "0 0 6px", fontWeight: 600 }}>
            🔒 Sign in to unlock
          </p>
          <p style={{ margin: 0, color: "#d1d5db" }}>
            {label}
          </p>
          {/* Arrow */}
          <div style={{
            position: "absolute", bottom: -5, right: 16,
            width: 10, height: 10, background: "#1f2937",
            transform: "rotate(45deg)",
          }} />
        </div>
      )}
    </div>
  );
}
