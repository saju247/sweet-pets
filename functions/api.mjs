import { getStore } from "@netlify/blobs";

const STORE_NAME = "sweet-pets-data";
const IMAGE_STORE = "sweet-pets-images";

function checkAuth(req) {
  const pwd = req.headers.get("x-admin-password");
  const p1 = process.env.ADMIN_PASSWORD;
  const p2 = process.env.ADMIN_PASSWORD_2;
  if (!p1) return false;
  return pwd === p1 || (p2 && pwd === p2);
}

function cors(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...extra
    }
  });
}

export default async function handler(req) {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" }
    });
  }

  // GET /api/data — public
  if (req.method === "GET" && path === "/api/data") {
    try {
      const store = getStore(STORE_NAME);
      const raw = await store.get("data");
      if (!raw) return cors(JSON.stringify({ pets: [], applyLink: "" }));
      return cors(raw);
    } catch {
      return cors(JSON.stringify({ pets: [], applyLink: "" }));
    }
  }

  // POST /api/data — protected
  if (req.method === "POST" && path === "/api/data") {
    if (!checkAuth(req)) return cors(JSON.stringify({ error: "Unauthorized" }), 401);
    try {
      const body = await req.text();
      JSON.parse(body); // validate JSON
      const store = getStore(STORE_NAME);
      await store.set("data", body);
      return cors(JSON.stringify({ ok: true }));
    } catch (e) {
      return cors(JSON.stringify({ error: e.message }), 400);
    }
  }

  // POST /api/image — upload photo
  if (req.method === "POST" && path === "/api/image") {
    if (!checkAuth(req)) return cors(JSON.stringify({ error: "Unauthorized" }), 401);
    try {
      const form = await req.formData();
      const file = form.get("image");
      if (!file) return cors(JSON.stringify({ error: "No image" }), 400);
      const id = "img-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      const buf = await file.arrayBuffer();
      const store = getStore(IMAGE_STORE);
      await store.set(id, buf, { metadata: { type: file.type || "image/jpeg" } });
      return cors(JSON.stringify({ id }));
    } catch (e) {
      return cors(JSON.stringify({ error: e.message }), 500);
    }
  }

  // GET /api/image/:id — serve photo
  if (req.method === "GET" && path.startsWith("/api/image/")) {
    const id = path.slice("/api/image/".length);
    if (!id) return cors(JSON.stringify({ error: "No id" }), 400);
    try {
      const store = getStore(IMAGE_STORE);
      const entry = await store.getWithMetadata(id, { type: "arrayBuffer" });
      if (!entry || !entry.data) return new Response("Not found", { status: 404 });
      const contentType = (entry.metadata && entry.metadata.type) || "image/jpeg";
      return new Response(entry.data, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable"
        }
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }

  return cors(JSON.stringify({ error: "Not found" }), 404);
}

export const config = { path: "/api/*" };
