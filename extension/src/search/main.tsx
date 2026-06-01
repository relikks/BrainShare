import React from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import { SearchApp } from "./SearchApp";

const el = document.getElementById("root");
if (!el) throw new Error("Root element not found");
createRoot(el).render(
  <React.StrictMode>
    <SearchApp />
  </React.StrictMode>,
);
