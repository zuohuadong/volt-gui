// brand.tsx provides a React context for the white-label identity resolved by
// the Go kernel. Components read the brand name / logo URLs from here instead
// of hard-coding "VoltUI" — enterprises can replace the entire chrome by
// setting [brand] in voltui.toml or VOLTUI_BRAND_* env vars.

import { createContext, useContext, useEffect, useState } from "react";
import { app } from "./bridge";
import { setCrashBrandName } from "./crash";

export interface BrandInfo {
  name: string;
  shortName: string;
  logoUrl: string;
  wordmarkUrl: string;
  iconUrl: string;
}

const defaultBrand: BrandInfo = {
  name: "VoltUI",
  shortName: "VoltUI",
  logoUrl: "",
  wordmarkUrl: "",
  iconUrl: "",
};

const BrandContext = createContext<BrandInfo>(defaultBrand);

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrand] = useState<BrandInfo>(defaultBrand);

  useEffect(() => {
    app.Brand()
      .then((b) => {
        setBrand(b);
        setCrashBrandName(b.name);
      })
      .catch(() => {});
  }, []);

  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandInfo {
  return useContext(BrandContext);
}
