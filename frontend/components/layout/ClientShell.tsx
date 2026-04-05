"use client";

import dynamic from "next/dynamic";
import Navbar from "./Navbar";

const Providers = dynamic(() => import("./Providers"), { ssr: false });

export default function ClientShell({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <Navbar />
      <main style={{ flex: 1 }}>{children}</main>
    </Providers>
  );
}
