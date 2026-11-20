-- Run these read-only queries in Cloudflare D1 > Your database > Console.
-- Times show UTC and Sri Lanka Standard Time (UTC+05:30).

-- 1. Latest NOWPayments orders, including completion time and coarse visitor location.
SELECT slug, currency, amount_usd, status,
       created_at_utc, created_at_ist, paid_at_utc, paid_at_ist,
       visitor_country, visitor_region, visitor_city, visitor_timezone,
       visitor_session_id, invoice_id
FROM premium_nowpayments_orders
ORDER BY created_ms DESC
LIMIT 100;

-- 2. Individual checkout attempts, even when no order was created.
SELECT created_at_ist, created_at_utc, provider, slug, currency,
       country, region, city, visitor_timezone, browser_timezone,
       status, error_code, session_id, order_id
FROM premium_checkout_attempts
ORDER BY created_ms DESC
LIMIT 100;

-- 3. Checkout interest by approximate country and payment method.
SELECT COALESCE(country,'Unknown') AS country,
       provider, COUNT(*) AS checkout_attempts,
       SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS completed
FROM premium_checkout_attempts
GROUP BY country, provider
ORDER BY checkout_attempts DESC;

-- 4. PayPal purchases and verified capture times (once PayPal is enabled).
SELECT slug, amount_usd, status, created_at_utc, created_at_ist,
       paid_at_utc, paid_at_ist, visitor_country, visitor_region,
       visitor_city, paypal_order_id
FROM premium_paypal_orders
ORDER BY created_ms DESC
LIMIT 100;

-- 5. Historical orders prior to the migration still retain their original epoch ms
-- and are automatically backfilled when the checkout API initializes.


-- 6. Pending direct $4.99 script requests (customer email and prefilled request message).
SELECT id, email, product, price_usd, message, status,
       notify_status, created_at_ist, created_at_utc,
       visitor_country, visitor_region, visitor_city
FROM premium_manual_requests
ORDER BY created_ms DESC
LIMIT 100;

-- 7. Mark a request as replied to after contacting the buyer.
-- Replace REQUEST_ID with the request's actual UUID:
-- UPDATE premium_manual_requests SET status='replied' WHERE id='REQUEST_ID';
