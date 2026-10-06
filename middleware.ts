import { NextResponse, type NextRequest } from "next/server";
export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (
    path.startsWith("/api/") &&
    req.headers.get("sec-fetch-site") === "cross-site"
  )
    return NextResponse.json(
      { error: "Permintaan lintas situs tidak diizinkan." },
      {
        status: 403,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  const res = NextResponse.next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  if (
    path.startsWith("/api/") ||
    ["/dashboard", "/profile", "/classes", "/access", "/learn"].includes(path)
  )
    res.headers.set("Cache-Control", "private, no-store");
  return res;
}
export const config = { matcher: ["/((?!assets/|favicon.svg).*)"] };
