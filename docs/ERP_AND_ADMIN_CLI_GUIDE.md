# Davi & Dani ERP + admin CLI — access guide

Everything needed to read data out of the two Davi & Dani back-office systems.
Written to be handed to an engineer or agent with no repo access: endpoints,
session mechanics, response shapes and the failure modes are all stated here.

**No credentials appear in this document, and none ever should.** Only env var
*names*. Values live in `.env.local`, Vercel project settings, or the macOS
Keychain.

There are two completely separate systems. Do not confuse them:

| | ERP | Admin portal |
|---|---|---|
| Host | `system.davidani.com` | `admin.davidani.com` |
| Vintage | Classic ASP, session cookies | Modern JSON API, JWT |
| Auth | form POST → cookie jar | `POST /api/auth/admin/login` → bearer token |
| Holds | styles, colors, barcodes, POs, inventory, sales orders, customers | orders, products, customers, promotions, dashboard analytics |
| Client | copy `evidence/erp.py` (227 lines) | `davidani-cli` (pip installable) |
| Credentials | `ERP_USER_ID` / `ERP_PASSWORD` | email + password in Keychain (`davidani-cli`) |

---

# Part 1 — The ERP (`system.davidani.com`)

## 1.1 Which reference implementation to copy

Three exist. Pick by need:

- **`davidani-ship-scanner/api/erp.py`** — the canonical one, ~5,000 lines. It
  is a Vercel serverless function carrying barcode maps, Google Sheets sync,
  SO writes and a PIN gate. Read it for the session pattern and to look up an
  endpoint; **do not copy it wholesale** into a new project.
- **`davidani-designbuddy/imgpipe/canvas_v2/evidence/erp.py`** — 227 lines,
  read-only, no framework, no Vercel baggage. **This is the one to copy** when
  a new tool needs ERP reads. Everything in §1.2–1.5 below is that file.
- **`davidani-faire-management/thumbnail-optimizer/erp_common.py`** — the
  inventory/OTS sweeps (§1.6). Uses a Chrome-cookie session instead of
  credentialed login; see the caveat there.

`davidani-ship-scanner/api/shipdate.py` is the ship-date classifier and is the
single source of truth for that logic — reuse it, never reimplement it.

## 1.2 Login

Classic ASP form login into a `requests.Session` cookie jar. There is no API
key and no token.

```python
BASE = "https://system.davidani.com"

def _login():
    uid, pwd = os.environ["ERP_USER_ID"], os.environ["ERP_PASSWORD"]
    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0", "Referer": BASE + "/login.asp"})
    s.post(BASE + "/xt.login.asp",
           data={"userId": uid, "userPass": pwd, "idStore": "1", "redirect": "main.asp"},
           timeout=15)
    probe = s.get(BASE + "/main.asp", timeout=10)
    if "/login.asp" in probe.url or "userPass" in probe.text:
        raise ErpError("ERP login did not authenticate")
    s.headers.update({"Referer": BASE + "/main.asp"})
    return s
```

Two non-obvious details:

- **The login POST does not tell you whether it worked.** It returns 200 with a
  page either way. You must probe `/main.asp` and check that you were not
  bounced to `/login.asp` and that the body does not render the `userPass`
  field.
- **`Referer` is required.** The ASP app rejects or misroutes requests without
  it. Set it to `/login.asp` for the login POST, then `/main.asp` afterwards.

Cache the session (module-global behind a lock) and re-login on cold start —
logging in per request is slow and rude to the server.

## 1.3 The expired-session trap

**A session that has expired does not return 401.** It returns 200 with an HTML
login page in the body, where you expected JSON. Every ERP client therefore has
the same three-part shape:

```python
def _decode(text):
    try:
        return json.loads(text.strip().lstrip("(").rstrip(")"))
    except (ValueError, AttributeError):
        raise AuthError("ERP returned a non-JSON body")   # = logged out

def _call(do):
    last = None
    for _ in range(3):
        try:
            return do(_session())
        except AuthError as exc:          # re-login and retry
            last = exc; _reset_session()
        except requests.exceptions.RequestException as exc:
            last = exc                    # transient; retry same session
    raise ErpError(str(last))
```

Note `_decode` also strips wrapping parentheses — some endpoints return JSONP-ish
`(...)` bodies. A bare `json.loads` fails on those.

Every read goes through `_call(lambda s: ...)`. That is the whole resilience
story: non-JSON ⇒ re-login, network error ⇒ retry, three attempts, then raise.

## 1.4 Read-only discipline

**Endpoints beginning `xt.` are WRITES.** `xt.SO.Add.asp`, `xt.Style.Add.asp`,
`xt.customer.add.asp`, `xt.Customer.CIM.Payment.Add.asp` and friends create real
records in the live business system. There is no sandbox and no dry-run.

A read-only integration must never call an `xt.*.asp` endpoint. The one
exception is `xt.login.asp`, which is the login form post.

The read endpoints all live under `/data/` and end in `.Json.asp` or
`.Load.asp`.

## 1.5 The read endpoints

All are on `BASE`. Params are the ones actually used in production.

**Best sellers / trends** — `POST /data/Rpt.Style.BestSellerStyle-Show.List.Json.asp`

```python
params = {"start": 0, "limit": 500, "gubun": "style", "issueIdStore": "",
          "orderDtFrom": dt_from, "orderDtTo": dt_to, "active": "All",
          "sort": "totSOQty", "dir": "DESC"}
# → {"results": [{idStyle, totSOQty, totSOAmt, cntSO, cntCustomer,
#                 onHandQty, OTSQty, season, styleImgT, styleImg}, ...]}
```

Filter out `idStyle == "SUMMARY"` (a totals row) and junk styles — the live
catalog contains `MYSTERY BOX`, `POLY-BAG`/`POLYBAG` and `TBN-` prefixed
non-garments. The colour-level variant is
`Rpt.Style.BestSellerStyleDTL-Show.List.Json.asp`.

**Sales orders for one style** — `GET /data/Style.Center.SO.Json.asp`

```python
{"idStyle": style, "start": 0, "limit": 400, "workStatus": "all"}
# → {"results": [...], "total": N}   — page with start until total
```

Per row: skip `brand == "summary"` and rows with no `idSO`; only
`workStatus in {"0","1","2"}` counts as a real sale; `orderDt` is `YYYY-MM-DD…`.
Useful fields: `totQty`, `totAmount`, `idCustomer` (distinct = boutique count).

**Style metadata** — `GET /data/Style.Center.StyleForm.Load.asp?idStyle=…`

Returns **JavaScript, not JSON** — an ASP-rendered form. Scrape it:

```python
re.search(r"\b" + name + r"\s*:\s*'([^']*)'", text)     # descr, season, filepath1
re.search(r"\bw1\b\s*:\s*'?([\d]+\.?[\d]*)'?", text)    # wholesale price
```

If `descr`, `season` and price are all absent, the style does not exist —
that's the existence check. Style descriptions carry literal `\n` escapes and
real newlines where an operator hit Enter mid-field; collapse whitespace before
displaying.

**Stock for one style** — `GET /data/Style.inStock.Json.asp`

**Inventory / OTS** — `GET /data/Inventory.Prediction.List.Json.asp` (see §1.6)

**Barcodes / style search** — `POST /data/Style.barcode.Json.asp`

```python
data = {"start": "0", "limit": "200", "fields": ["idStyle"], "query": [query]}
# → results[] or rows[] — note the two possible keys
```
This doubles as partial-code style search. Print form:
`/include/contents/printForm/Style.barcode.prn.asp`; barcode image:
`/test/barcode.asp`.

**Style files / gallery** — `GET /data/Basic.Code.Json.asp?divs=style`

The only ERP surface that carries `colorNm` per file, which is why colour-tagged
imagery goes through it rather than `styleimage.asp`.

**Images** — thumbs come back as paths like `/style/T_x.jpg`. Resolve them:

```python
def image_url(path):           # '/style/T_x.jpg' -> full URL
    p = path if path.startswith("/") else "/" + path
    if not p.lower().startswith("/upload/"):
        p = "/upload" + p
    return BASE + quote(p, safe="/:()_-.")
```
The thumbnail of a full-res path is the same path with `T_` prefixed to the
filename. Image fetches need the authenticated session too.

## 1.6 Inventory sweeps — the expensive part

`Inventory.Prediction.List.Json.asp` answers OTS (open-to-sell), on-hand,
incoming PO and backordered quantities. Two shapes:

```python
# one style
{"vidStyle": style, "fromWhere": "style", "start": 0, "limit": 100}
# → {otsQty, onhandQty, expPOQty, backOrderQty}

# whole company, paged (~104K rows)
{"start": start, "limit": 2000}
# → {"results": [...]}  — skip rows where idStore == "0" (summary), sum the rest
```

**Do not brute-force this.** A full per-style sweep (~5,500 styles, one call
each) takes 35–45 minutes and the ASP server drops connections under sustained
load. In preference order:

1. **Reuse the last sweep.** `thumbnail-optimizer/measurement/ots_totals.json`
   persists per-style OTS daily and is good for hours.
2. **`bulk_ots()`** — the whole company table in one paged sweep, ~20 min with
   polite pauses. Use when you genuinely need every style.
3. **Per-style calls** only for the working set that needs per-colour dates —
   unlisted-PO rows, republish/takedown candidates, a few hundred — never the
   catalog.

The sweep code earns its defensive shape: `Connection: close` (keep-alive is
what the server drops), `timeout=300`, five attempts with `time.sleep(10 * n)`
backoff, and **the page size halves** after repeated failures. Counter-intuitively
`per_style_ots()` — 2,000 tiny queries, ~15 min — often survives afternoon
server moods that kill the bulk pull, because each response is small. Individual
style failures are skipped, not fatal (17 of 2,055 were unreadable on one sweep).

Incremental rule: re-query only styles whose on-hand/OTS changed or that entered
a working set since the last sweep. Everything else keeps its cached value with
the sweep's timestamp.

## 1.7 Two ways to hold a session

- **Credentialed login** (`ERP_USER_ID` / `ERP_PASSWORD`) — §1.2. Works
  anywhere: a plain shell, a serverless function, CI. **Use this by default.**
- **Chrome cookie jar** (`browser_cookie3.chrome(domain_name=…)`) — used by
  `erp_common.session()`. It needs the macOS Keychain, so it only works on the
  Mac mini under a real login session. Fine for launchd jobs on that machine,
  useless anywhere else.

If an unattended job authenticates from a plain shell, it must use the
credentialed path.

---

# Part 2 — The admin CLI (`admin.davidani.com`)

A read-only data pipe over the JoEunCommerce-built seller-admin API, so other
`davidani-*` tools consume real data without re-implementing auth.

## 2.1 Install and log in

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e .            # from the davidani-cli repo
davidani-cli auth login     # prompts for email + password
```

`auth login` stores email, password and the returned JWT in the **macOS
Keychain** under service `davidani-cli`. Every later command reuses the cached
token and silently re-authenticates when it is within 60 seconds of expiry.

## 2.2 Commands

```bash
davidani-cli orders list [--status SHIPPED] [--csv]
davidani-cli orders get <order-id>
davidani-cli products list [--csv]
davidani-cli customers list [--page-size 100] [--csv]
davidani-cli promotions list
davidani-cli analytics dashboard --from 2026-06-02 --to 2026-08-31
```

JSON on stdout by default, so it pipes:

```bash
davidani-cli orders list --status SHIPPED | jq '.[].orderId'
```

## 2.3 Talking to the API directly

```
POST /api/auth/admin/login      {"username": email, "password": password}
                                → {"success": true, "data": {"token": "<jwt>"}}
GET  /api/seller-admin/order/list
GET  /api/seller-admin/order/{id}
POST /api/seller-admin/product/list      {}          ← POST, with an empty body
GET  /api/seller-admin/customer/list     ?pageSize=…
GET  /api/seller-admin/promotion/list
GET  /api/seller-admin/dashboard         ?from=&to=
```

Auth header is `Authorization: Bearer <token>`. Note the login field is
`username`, not `email`, and `product/list` is a POST while its siblings are
GETs.

**Every response is enveloped.** Unwrap before use — and check `success`, not
just the HTTP status:

```python
body = response.json()
if not response.is_success or not body.get("success"):
    raise DavidaniAPIError(body.get("message") or f"HTTP {response.status_code}")
return body.get("data")
```

Expiry is read straight off the JWT — base64-decode the payload segment (pad to
a multiple of 4 first) and read `exp`; refresh at `exp - 60`. The signature is
not verified client-side; the server is the authority.

## 2.4 Headless contexts

`login_headless(email, password)` returns a token and **never touches the
Keychain**. Under cron/launchd there is no interactive GUI session and keyring
writes fail with macOS error `-25308` (interaction not allowed). Unattended
scripts hold the token in memory for one run and cache nothing.

---

# Part 3 — Rules that apply to both

1. **Never write a credential into a repo, a doc, or a shared knowledge file.**
   Env var names only. Secrets live in `.env.local` (gitignored), Vercel project
   settings, or the Keychain.
2. **The ERP is the live business system.** No sandbox. Read-only means
   read-only: nothing under `xt.*.asp` except login.
3. **Check the body, not the status code.** The ERP returns HTML-200 when
   logged out; the admin API returns `success: false` inside a 200. Neither
   failure looks like a failure to `raise_for_status()`.
4. **Cache the session, retry on transient errors, re-login on auth errors.**
   Three attempts, then fail loudly.
5. **Be polite to the ASP server.** Pauses between pages, `Connection: close`
   on sweeps, shrinking page sizes under stress. It drops connections when
   pushed, and hammering it degrades the warehouse's own tooling.
6. **Reuse the reference implementations.** `evidence/erp.py` for ERP reads,
   `api/shipdate.py` for ship-date classification, `davidani-cli` for the admin
   portal. Re-deriving any of them wastes a day and gets the edge cases wrong.
