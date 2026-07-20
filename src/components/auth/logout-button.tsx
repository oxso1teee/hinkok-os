"use client";

import { useState } from "react";

export function LogoutButton() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function logout() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
    } finally {
      window.location.assign("/login");
    }
  }

  return (
    <button
      className="secondary-button"
      type="button"
      onClick={logout}
      disabled={isSubmitting}
    >
      {isSubmitting ? "Выход…" : "Выйти"}
    </button>
  );
}
