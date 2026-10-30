import { useEffect, useRef, useState } from "react";
import { canEditCompanyRental } from "../lib/companyRental";
import { rentalWebsiteKey, rentalWebsitePatch } from "../lib/companyRentalWebsite";
import { loadRentalWebsiteInfo, needsRentalWebsiteCheck } from "../lib/rentalWebsiteClient";
import { saveRentalWebsiteCheck } from "../lib/companyRentalRepository";

// Read public source pages at most daily, sequentially. No cloud timer/listener is needed.
export function useRentalWebsiteChecks(items, user, enabled) {
  const attempts = useRef(new Set()), [results, setResults] = useState({});
  useEffect(() => {
    if (!enabled || !user?.uid) return;
    let cancelled = false;
    async function scan() {
      for (const rental of items) {
        const key = `${user.uid}:${rental.id}:${rentalWebsiteKey(rental.websiteUrl)}`;
        if (cancelled) return;
        if (rental.status !== "available" || !needsRentalWebsiteCheck(rental) || attempts.current.has(key)) continue;
        try {
          const info = await loadRentalWebsiteInfo(user, rental.websiteUrl);
          if (cancelled) return;
          attempts.current.add(key);
          const patch = rentalWebsitePatch(rental, info);
          if (!patch) continue;
          setResults(current => ({ ...current, [rental.id]: info }));
          if (canEditCompanyRental(rental, user.uid)) await saveRentalWebsiteCheck(rental, info, user);
        } catch {
          if (!cancelled) attempts.current.add(key);
          // A failed check never clears a URL or marks a listing unavailable.
        }
      }
    }
    scan();
    return () => { cancelled = true; };
  }, [items, user, enabled]);
  return results;
}
