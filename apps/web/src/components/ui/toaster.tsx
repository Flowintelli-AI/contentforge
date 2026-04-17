"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "bg-white border shadow-md rounded-lg text-sm",
          error: "border-red-200 text-red-800",
          success: "border-green-200 text-green-800",
        },
      }}
    />
  );
}
