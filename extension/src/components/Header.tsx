import { useState } from "react";
import type { Branding } from "@/types";

export function Header({ branding }: { branding: Branding }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = branding.logo_url && !imgFailed;

  return (
    <div className="flex items-center gap-2.5">
      {showImage ? (
        <img
          src={branding.logo_url}
          alt=""
          className="w-8 h-8 rounded-md object-contain"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <FallbackLogo />
      )}
      <h1 className="text-base font-semibold tracking-tight">{branding.name}</h1>
    </div>
  );
}

function FallbackLogo() {
  return (
    <div className="w-8 h-8 rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm">
      Σ
    </div>
  );
}
