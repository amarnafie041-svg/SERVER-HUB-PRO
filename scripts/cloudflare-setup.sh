#!/bin/bash
set -e

echo "=========================================="
echo "  Cloudflare Setup - SERVER HUB v5"
echo "=========================================="

CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
CLOUDFLARE_ZONE_ID="${CLOUDFLARE_ZONE_ID:-}"
DOMAIN="${CLOUDFLARE_DOMAIN:-}"

if [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ZONE_ID" ]; then
  echo "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID env vars"
  echo "Or configure manually via Cloudflare Dashboard"
  exit 1
fi

API="https://api.cloudflare.com/client/v4"
AUTH="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
CONTENT_TYPE="Content-Type: application/json"

echo "[1/6] Enabling SSL/TLS (Full Strict)..."
curl -s -X PATCH "$API/zones/$CLOUDFLARE_ZONE_ID/settings/ssl" \
  -H "$AUTH" -H "$CONTENT_TYPE" \
  --data '{"value":"full"}' > /dev/null

echo "[2/6] Enabling Always Use HTTPS..."
curl -s -X PATCH "$API/zones/$CLOUDFLARE_ZONE_ID/settings/always_use_https" \
  -H "$AUTH" -H "$CONTENT_TYPE" \
  --data '{"value":"on"}' > /dev/null

echo "[3/6] Enabling Auto Minify..."
curl -s -X PATCH "$API/zones/$CLOUDFLARE_ZONE_ID/settings/minify" \
  -H "$AUTH" -H "$CONTENT_TYPE" \
  --data '{"value":{"css":"on","html":"on","js":"on"}}' > /dev/null

echo "[4/6] Enabling Brotli compression..."
curl -s -X PATCH "$API/zones/$CLOUDFLARE_ZONE_ID/settings/brotli" \
  -H "$AUTH" -H "$CONTENT_TYPE" \
  --data '{"value":"on"}' > /dev/null

echo "[5/6] Setting Security Level to High..."
curl -s -X PATCH "$API/zones/$CLOUDFLARE_ZONE_ID/settings/security_level" \
  -H "$AUTH" -H "$CONTENT_TYPE" \
  --data '{"value":"high"}' > /dev/null

echo "[6/6] Enabling WAF..."
curl -s -X PATCH "$API/zones/$CLOUDFLARE_ZONE_ID/settings/waf" \
  -H "$AUTH" -H "$CONTENT_TYPE" \
  --data '{"value":"on"}' > /dev/null

echo ""
echo "Creating Firewall Rules..."

# Rate limiting rule for API
curl -s -X POST "$API/zones/$CLOUDFLARE_ZONE_ID/firewall/rules" \
  -H "$AUTH" -H "$CONTENT_TYPE" \
  --data '{
    "action":"block",
    "priority":1,
    "expression":"(http.request.uri.path contains \"/api\") and (http.request.method ne \"GET\") and (ip.geoip.country eq \"T1\")",
    "description":"Block non-GET API requests from unknown networks"
  }' > /dev/null

# Block bad user agents
curl -s -X POST "$API/zones/$CLOUDFLARE_ZONE_ID/firewall/rules" \
  -H "$AUTH" -H "$CONTENT_TYPE" \
  --data '{
    "action":"block",
    "priority":2,
    "expression":"(http.user_agent contains \"curl\") or (http.user_agent contains \"wget\") or (http.user_agent contains \"python-requests\")",
    "description":"Block known bad user agents"
  }' > /dev/null

echo ""
echo "=========================================="
echo "  Cloudflare setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Add your domain in Cloudflare Dashboard"
echo "  2. Update DNS A record to your server IP (proxied/orange cloud)"
echo "  3. Update CLOUDFLARE_DOMAIN in .env"
echo "  4. Restart your server"
echo "=========================================="
