import React, { createContext, useContext, useState } from "react";
import { createT } from "./i18n.js";

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem("gree_lang") || "sq");

  function toggle() {
    setLang((l) => {
      const next = l === "sq" ? "en" : "sq";
      localStorage.setItem("gree_lang", next);
      return next;
    });
  }

  const t = createT(lang);
  return <LangContext.Provider value={{ lang, toggle, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
