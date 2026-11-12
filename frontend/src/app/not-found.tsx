// Shown for any unknown address. Rendered dynamically like the other pages, so the nonce CSP applies.
import Link from "next/link";

/** The 404 page, with a link back to the tracker. */
export default function NotFound() {
  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 32px" }}>
      <h1>Page not found</h1>
      <p>
        There is nothing at this address. <Link href="/">Go to construction material prices</Link>.
      </p>
    </main>
  );
}
