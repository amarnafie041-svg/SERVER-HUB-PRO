# Cloudflare Integration Guide - SERVER HUB v5

## Prerequisites
1. A Cloudflare account with your domain added
2. Your domain's nameservers pointed to Cloudflare
3. Server IP address (your Render/Railway/etc. server)

## Step 1: Add your domain to Cloudflare
1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click "Add a Site" and enter your domain
3. Select the Free plan (or higher)
4. Copy the Cloudflare nameservers and update them at your domain registrar

## Step 2: Configure DNS Records
1. In Cloudflare Dashboard → DNS → Records
2. Add an A record:
   - Type: `A`
   - Name: `@` (or subdomain like `hub`)
   - IPv4: Your server IP
   - Proxy status: **Proxied** (orange cloud) ✅ — THIS IS CRITICAL
3. Add a CNAME for www if needed
4. Add an A record for `*` if you want wildcard support

## Step 3: Configure SSL/TLS
1. Cloudflare Dashboard → SSL/TLS → Overview
2. Set to **Full (strict)** — requires a valid SSL cert on your origin server
3. Enable **Always Use HTTPS**
4. Enable **Automatic HTTPS Rewrites**

## Step 4: Security Settings
1. SSL/TLS → Edge Certificates:
   - Enable **Always Use HTTPS**
   - Enable **Automatic HTTPS Rewrites**
   - Enable **HSTS** with max-age 31536000, includeSubDomains, preload

2. Security → Settings:
   - Security Level: **High** or **Under Attack** if needed
   - Challenge Passage: 30 minutes
   - Browser Integrity Check: **On**
   - Bot Fight Mode: **On**

3. Security → WAF:
   - Enable WAF (Web Application Firewall)
   - Add custom rules to block malicious traffic

## Step 5: Firewall Rules (Recommended)

### Rule 1: Block malicious requests
- Expression: `(http.request.uri.path contains "/api") and (http.request.method ne "GET") and (ip.geoip.country eq "T1")`
- Action: Block

### Rule 2: Protect admin panel
- Expression: `(http.request.uri.path contains "/admin") and (not cf.client.bot) and (not ip.geoip.country in {"US" "GB" "DE" "FR" "CA" "AU"})`
- Action: Managed Challenge

### Rule 3: Rate limiting
- Add rate limiting rule: 200 requests per minute per IP on API routes

## Step 6: Caching Configuration
1. Caching → Configuration:
   - Caching Level: **Standard**
   - Edge Cache TTL: Respect Existing Headers
   - Always Online: **Off** (to avoid serving stale content)

2. Caching → Cache Rules:
   - Create rule for `/assets/*`: Cache for 1 year
   - Create rule for static files (`.js`, `.css`, `.png`, `.svg`): Cache for 1 year
   - Bypass cache for `/api/*` routes

## Step 7: Server Configuration

### Environment Variables
Add these to your `.env` or Render dashboard:
```env
CLOUDFLARE_DOMAIN=https://hub.yourdomain.com
CLOUDFLARE_ENABLED=true
```

### What's Already Configured
The backend (`app.ts`) now includes:
- ✅ Trust proxy — gets real visitor IP behind Cloudflare
- ✅ Cloudflare security headers (CSP, HSTS, etc.)
- ✅ Cache-Control optimized for Cloudflare
- ✅ Proper CORS with Cloudflare domain

## Step 8: Verify
1. Visit `https://yourdomain.com` - should load with Cloudflare SSL
2. Check browser console for any mixed content errors
3. Verify WebSocket connections work (used for terminal)
4. Run: `curl -I https://yourdomain.com` to check headers

## Troubleshooting

### 521/522 Errors (Web Server Down)
- Your origin server must be accessible
- Check your server is running (`node dist/index.js`)
- Temporarily set DNS to DNS-only (grey cloud) to test

### 525/526 Errors (SSL Handshake)
- Ensure your origin server has SSL configured
- Use Full (strict) only if origin has a valid cert
- Try "Full" mode instead of "Full (strict)"

### WebSocket Not Working
- Cloudflare Free plan supports WebSockets automatically
- Ensure `ws://` routes work through the proxy
- Check server logs for WebSocket upgrade failures

### Mixed Content Warnings
- Ensure all resources load via HTTPS
- The `CORS_ORIGIN` in `.env` must use HTTPS

## Additional: Turnstile (CAPTCHA)
Add Cloudflare Turnstile to the login page for extra security:
1. Go to Cloudflare Dashboard → Turnstile
2. Create a new site
3. Add `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` to `.env`

---

For issues, check the Cloudflare Dashboard analytics and your server logs.
