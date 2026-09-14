import { useEffect, useState } from "react";

export default function App() {
  const [health, setHealth] = useState<string>("checking...");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHealth(`${d.status} (${d.service})`))
      .catch(() => setHealth("unreachable"));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>RoomSync</h1>
      <p>Shared expenses and chores for your household.</p>
      <p>API status: <strong>{health}</strong></p>
    </main>
  );
}
