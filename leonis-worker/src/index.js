export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const url = new URL(request.url);

    if (url.pathname !== "/subscribe") {
      return jsonResponse({ error: "Not found" }, 404, headers);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    }

    try {
      const { email } = await request.json();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ error: "Email no válido." }, 400, headers);
      }

      const beehiivResponse = await fetch(
        `https://api.beehiiv.com/v2/publications/${env.BEEHIIV_PUBLICATION_ID}/subscriptions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.BEEHIIV_API_KEY}`
          },
          body: JSON.stringify({
            email,
            reactivate_existing: true,
            send_welcome_email: true
          })
        }
      );

      const rawText = await beehiivResponse.text();

      let result = {};
      try {
        result = rawText ? JSON.parse(rawText) : {};
      } catch {
        result = { raw: rawText };
      }

      if (!beehiivResponse.ok) {
        const message =
          result?.errors?.[0]?.message ||
          result?.message ||
          result?.error ||
          "No se pudo crear la suscripción en Beehiiv.";

        return jsonResponse({ error: message, details: result }, beehiivResponse.status, headers);
      }

      return jsonResponse({ success: true, details: result }, 200, headers);
    } catch (error) {
      return jsonResponse(
        {
          error: "Error interno del Worker.",
          details: String(error)
        },
        500,
        headers
      );
    }
  }
};

function corsHeaders(origin) {
  const allowedOrigins = [
    "https://theleonisproject.com",
    "https://www.theleonisproject.com",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
  ];

  const allowOrigin = allowedOrigins.includes(origin)
    ? origin
    : "https://theleonisproject.com";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers
  });
}