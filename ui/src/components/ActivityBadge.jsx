import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";
import { client } from "../api/client.js";

/** Nav indicator, so running work is visible from any page rather than only on Activity. */
export function ActivityBadge() {
  const { data } = useQuery({
    queryKey: ["active"],
    queryFn: client.active,
    refetchInterval: 5000,
  });
  const n = data?.active?.length ?? 0;
  if (!n) return <NavLink to="/activity">Activity</NavLink>;
  return (
    <NavLink to="/activity" style={{ color: "var(--accent)", fontWeight: 600 }}>
      Activity
      <span className="badge" style={{ marginLeft: 6, borderColor: "var(--accent)", color: "var(--accent)" }}>
        {n} running
      </span>
    </NavLink>
  );
}
