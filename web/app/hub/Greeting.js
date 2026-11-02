"use client";

import { useEffect, useState } from "react";
import { greetingFor } from "@/lib/briefing";

// "Good evening, jay." by the viewer's own clock (the server only knows its own time zone, so it says "Welcome back" until the page is up).
export default function Greeting({ name }) {
  const [hello, setHello] = useState("Welcome back");
  useEffect(() => {
    const t = setTimeout(() => setHello(greetingFor(new Date().getHours())), 0);
    return () => clearTimeout(t);
  }, []);
  return (
    <h1 className="yw-h1">
      {hello}
      {name ? (
        <>
          , <span className="yw-name-hi">{name}</span>
        </>
      ) : null}
      .
    </h1>
  );
}
