"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/error-log";

// Kök düzende yakalanmayan hata. Kendi belgesini çizer (genel stiller yüklenmez); hata error_logs'a yazılır.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#060808",
          color: "#f1f5f4",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 16,
        }}
      >
        <title>Bir hata oluştu | SiftahGo</title>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Bir şeyler ters gitti</h1>
          <p style={{ color: "#b3bebb", marginTop: 8 }}>Sayfa yüklenirken beklenmeyen bir hata oluştu.</p>
          <button
            onClick={() => retry()}
            style={{
              marginTop: 16,
              padding: "10px 20px",
              borderRadius: 999,
              border: 0,
              background: "#2dd4bf",
              color: "#042f2e",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tekrar dene
          </button>
        </div>
      </body>
    </html>
  );
}
