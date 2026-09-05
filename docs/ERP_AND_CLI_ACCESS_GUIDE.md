# Davi & Dani data access — ERP and the admin CLI

Everything another engineer or agent needs to read Davi & Dani's live business
data. Two completely separate systems, two different auth models:

| | **ERP** | **Admin platform** |
|---|---|---|
| Host | `system.davidani.com` | `admin.davidani.com` |
| Built by | legacy Classic-ASP vendor | JoEunCommerce |
| Auth | form POST → session cookie | JWT bearer token |
| Holds | styles, colorways, inventory/OTS, POs, sales orders, barcodes, style photos | orders, products, customers, promotions, dashboard analytics |
| Access via | `davidani-ship-scanner/api/erp.py` (reference impl) | `davidani-cli` |
| Credentials | `ERP_USER_ID` / `ERP_PASSWORD` | email + password in macOS Keychain |

**No secret values appear in this document, and none should ever be written
into any file, commit, or config that is checked in. Only variable names.**

Yes — the ERP half is best done through **`davidani-ship-scanner`**. Its
`api/erp.py` is the mature reference implementation (session caching, retry,
re-login on expiry) and `api/shipdate.py` is the single source of truth for
ship-date logic. Do not reverse-engineer the ERP again; copy one of the two
clients in §2.

---

## PART ONE — THE ERP

### 1. The shape of the thing

`system.davidani.com` is a Classic-ASP application. There is no REST API and
no documentation. What it has is a set of `.asp` endpoints that the ERP's own
web UI calls over XHR, most of which return JSON. Those are what every
davidani-* tool talks to.

Two conventions matter immediately:

- **`/data/*.Json.asp` and `/data/*.Load.asp` are reads.**
- **`/data/xt.*.asp` and `/xt.*.asp` are WRITES.** `xt.SO.Add.asp` creates a
  sales order; `xt.Style.Add.asp` creates a style. **A read-only client must
  never call an `xt.*` endpoint.** Say this in the system prompt of any agent
  you give ERP access to.

The JSON is sometimes wrapped in parentheses, so every response goes through a
decoder that strips them — and a non-JSON body almost always means the session
expired and the ERP served the login page HTML instead. That is the single most
important error case (§2.3).

### 2. Getting a session

#### 2.1 Login

```python
BASE = "https://system.davidani.com"

s = requests.Session()
s.headers.update({"User-Agent": "Mozilla/5.0", "Referer": BASE + "/login.asp"})
s.post(BASE + "/xt.login.asp",
       data={"userId": os.environ["ERP_USER_ID"],
             "userPass": os.environ["ERP_PASSWORD"],
             "idStore": "1", "redirect": "main.asp"},
       timeout=15)

# Verify — the POST "succeeds" even when the credentials are wrong.
probe = s.get(BASE + "/main.asp", timeout=10)
if "/login.asp" in probe.url or "userPass" in probe.text:
    raise ErpError("ERP login did not authenticate")
s.headers.update({"Referer": BASE + "/main.asp"})
```

`xt.login.asp` is the one `xt.*` endpoint a read-only client calls; it is the
login form's own action, not a data write.

The auth check is deliberately a *probe*, not a status code: a logged-out
session is redirected to `/login.asp`, whose body renders the `userPass`
field. Presence of that string is the tell.

#### 2.2 Cache the session, module-level, behind a lock

```python
_lock = threading.Lock()
_cached_session = None

def _session():
    global _cached_session
    with _lock:
        if _cached_session is None:
            _cached_session = _login()
        return _cached_session

def _reset_session():
    global _cached_session
    with _lock:
        _cached_session = None
```

On Vercel this survives across invocations on a warm instance and re-logs-in on
a cold start. In a long script it means one login for the whole run.

#### 2.3 Retry wrapper — the pattern everything goes through

```python
def _call(do):
    last = None
    for _ in range(3):
        try:
            return do(_session())
        except AuthError as exc:        # non-JSON body = session died
            last = exc
            _reset_session()            # drop it and re-login on the next pass
        except requests.exceptions.RequestException as exc:
            last = exc
    raise ErpError(str(last))

def _decode(text):
    try:
        return json.loads(text.strip().lstrip("(").rstrip(")"))
    except (ValueError, AttributeError):
        raise AuthError("ERP returned a non-JSON body")
```

`AuthError` is raised by the *decoder*, not by any HTTP check. That is the
trick: the ERP answers an expired session with HTTP 200 and a login page. The
decoder catching that and the retry loop resetting the session is what makes
unattended jobs survive for months.

#### 2.4 Which client to copy

- **`davidani-ship-scanner/api/erp.py`** — the full one. Session caching,
  retry, style/colorway resolution, barcodes, images, ship-date classification.
  Carries Vercel-serverless baggage (bundled pages, PIN gates, Google Sheets).
- **`davidani-ship-scanner/scripts/bridge.py`** — the same logic as a plain
  script, for local runs.
- **`davidani-designbuddy/imgpipe/canvas_v2/evidence/erp.py`** — 227 lines,
  the minimal read-only client: login, retry, best-seller report, per-style SO
  lines, style form meta, style-code search. **Copy this one** when a repo needs
  ERP reads without the serverless baggage. It opens with the right instruction
  in its docstring: *"Never call an `xt.*.asp` write."*
- **`davidani-faire-management/thumbnail-optimizer/erp_common.py`** — the
  inventory/OTS sweep helpers (§4).

### 3. The endpoint catalog (reads)

| Endpoint | Returns |
|---|---|
| `/data/Style.inStock.Json.asp` | **the availability grid** — one row per colorway/size-run. Params: `div=Ava`, `idStyle`, `vidStore=1`, `active=1`, `start`, `limit` |
| `/data/Style.Center.StyleForm.Load.asp` | style form (JS source, not JSON) — `ratio`, `season`, `w1` (wholesale price), `filepath1` (main image), `styleType` flag |
| `/data/Style.Center.SO.Json.asp` | sales-order lines for one style |
| `/data/Style.barcode.Json.asp` | barcodes per colorway |
| `/data/Basic.Code.Json.asp` (`divs=style`) | style file listing — the only surface carrying `colorNm` per file |
| `/data/Rpt.Style.BestSellerStyle-Show.List.Json.asp` | best-seller report by style (POST; date range + sort) |
| `/data/Rpt.Style.BestSellerStyleDTL-Show.List.Json.asp` | same, by colorway |
| `/data/SO.List.Json.asp` | sales orders |
| `/data/Inventory.Prediction.List.Json.asp` | **OTS / on-hand / incoming** (§4) |
| `/styleimage.asp?style=` | the style's photo gallery |
| `/test/barcode.asp` | barcode image render |
| `/upload/…` | image files (prefix a bare `/style/x.jpg` path with `/upload`) |

Key row fields on the availability grid:

```
colorNm     colorway name
idStyleDtl  the colorway's barcode / detail id
idSizes     size-run key (1 = S/M/L, 7 = 1X/2X/3X)
sizeNm      actual size names ("SM ML") — the source of truth for size pills
otsQty      open-to-sell; <= 0 means oversold/committed
atsQty      available-to-sell
totQty      on hand
dropItem    "1" = merchandising dropped this colorway
```

Style-code conventions worth knowing:

- **`D`-led and `P`-led codes are twins.** `DR50011` (regular, S/M/L) ↔
  `PR50011` (plus, 1XL/2XL/3XL). Swap the leading letter to find the pair.
- `styleType` is usually empty; a decorative flag like `- STOP  -` means
  merchandising marked the style. Strip the dashes → `STOP`.
- Junk codes to filter out of reports: `MYSTERY BOX`, `POLY-BAG`, `TBN-*`,
  and the literal `SUMMARY` row.

### 4. Inventory sweeps — do not brute-force

This is the most expensive mistake available in this system, so it gets its
own section.

A full per-style OTS sweep (`Inventory.Prediction.List.Json.asp` with
`vidStyle`, one call per style, ~5,500 styles) takes **35–45 minutes**, and the
ASP server drops connections under sustained load. Never run it to refresh one
block of a feed.

Fast paths, in order of preference:

1. **Reuse the last sweep.** `davidani-faire-management/thumbnail-optimizer/
   measurement/ots_totals.json` holds per-style OTS, persisted daily. Good for
   hours.
2. **`erp_common.bulk_ots(sess)`** — the whole company table in one paged
   sweep (~104K rows, ~20 min). Use it when you genuinely need every style.
3. **Per-style calls only for the working set** (`per_style_ots_with_dates`) —
   the few hundred rows that need per-colour dates. Never the catalog.

`bulk_ots` is the shape to copy for any large ERP pull:

```python
r = sess.get(ERP_BASE + "/data/Inventory.Prediction.List.Json.asp",
             params={"start": start, "limit": page}, timeout=300,
             headers={"Connection": "close"})   # keep-alive OFF
```

with, around it: 5 attempts, `sleep(10 * (attempt + 1))` backoff, **page size
halving** after repeated failures, pauses between pages, and skipping
`idStore == "0"` (those are summary rows and would double every total).

Incremental rule: re-query only styles whose on-hand/OTS changed, or that
entered a working set since the last sweep. Everything else keeps its cached
value stamped with the sweep's timestamp.

### 5. Ship-date logic — don't reimplement it

`davidani-ship-scanner/api/shipdate.py` is the single source of truth.
`classify(totQty, otsQty, deli_date, season, packs)` returns the state every
Davi & Dani surface shows. Two things about it that surprise people:

- **It is date-dependent.** The "New" tiers roll every **December 1** (server
  UTC): `red_year` = the current year, or next year once it's December.
  `year >= red_year` → red-new; `== red_year - 1` → black-new; older or unknown
  → sold out. A date-TBD pre-order (incoming PO, no date) → black-new "New".
- **A PO date expires.** Once its month is over, `_date_stale()` retires it and
  the colorway falls through to undated black-new. Grace runs to the *end* of
  the named month — a cancel date is the tail of a window, and the UI strips
  the year, so a stale PO would otherwise read "Arrives June" in August.

Consequence for tests: **any fixture with a real date must pin `today=`.**
`scripts/test_shipdate.py` pins `TODAY` to the 2026-06-07 ERP capture date;
unpinned, its June/July arrivals go stale and the suite fails on the calendar.

### 6. Caching discipline

From the reference implementation:

- **Stock is never cached.** Availability rows are always fetched live.
- **Near-static meta is cached for 60s** (`_META_TTL`) — ratio, season, price,
  main image — so a price change shows within a minute while burst lookups stay
  fast.
- **On an ERP hiccup, serve the last good meta** rather than dropping to blanks.
  A stale season beats an empty one.

### 7. Running unattended

- On the Mac mini, ERP reads under `launchd` work only with the credentialed
  login (`ERP_USER_ID` / `ERP_PASSWORD`). A Chrome-cookie session needs the
  keychain and an interactive GUI session, which launchd does not have.
- Deploys of ship-scanner are **`git push` only**. Never `vercel --prod` /
  `vercel deploy` — a stale CLI upload once stole the production alias and
  served an old build for days.

---

## PART TWO — THE ADMIN CLI

`davidani-cli` is a read-only data pipe for `admin.davidani.com`, so other
tools consume real orders/products/customers without re-implementing auth.

### 8. Install and log in

```bash
cd ~/Code/davidani-cli
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
davidani-cli auth login          # prompts for email + password
```

Credentials and the resulting JWT go into the **macOS Keychain** under service
`davidani-cli` (keys `email`, `password`, `token`). Nothing is written to disk.

### 9. Commands

```bash
davidani-cli orders list [--status SHIPPED] [--csv]
davidani-cli orders get <order-id>
davidani-cli products list [--csv]
davidani-cli customers list [--page-size 100] [--csv]
davidani-cli promotions list
davidani-cli analytics dashboard --from 2026-06-02 --to 2026-08-31
```

Everything defaults to JSON on stdout, so it pipes:

```bash
davidani-cli orders list --status SHIPPED | jq '.[].orderId'
```

### 10. The API underneath

Base `https://admin.davidani.com`. Login is
`POST /api/auth/admin/login` with `{"username": email, "password": password}`,
returning `{ success, data: { token } }`. Every other call carries
`Authorization: Bearer <token>`.

```
GET  /api/seller-admin/order/list
GET  /api/seller-admin/order/{id}
POST /api/seller-admin/product/list      # POST with {} body, not GET
GET  /api/seller-admin/customer/list     # params: page size etc.
GET  /api/seller-admin/promotion/list
GET  /api/seller-admin/dashboard         # params: from, to
```

Every response is enveloped: `{ success: bool, message: str, data: … }`. The
client unwraps it and raises on `success: false` **even when the HTTP status is
2xx** — that check is not optional, the API returns 200 with `success: false`.

### 11. Token handling

- `get_token()` reads the cached JWT, decodes the `exp` claim without verifying
  the signature, and refreshes **60 seconds before** actual expiry to avoid
  racing a request. If no token or it is stale, it re-authenticates from the
  stored email/password.
- **`login_headless(email, password)` exists for cron/launchd.** In a
  non-interactive context keyring writes fail with macOS error **-25308**
  (interaction not allowed). `login_headless` does the same POST, returns the
  token, and touches the Keychain not at all — the caller holds it in memory
  for one run. Use this in any scheduled job.
- `logout()` deletes all three Keychain entries.

### 12. Using it as a library

```python
from davidani_cli.client import DavidaniClient
data = DavidaniClient().get("/api/seller-admin/order/list")

# headless / scheduled:
from davidani_cli import auth
token = auth.login_headless(os.environ["DD_ADMIN_EMAIL"], os.environ["DD_ADMIN_PASSWORD"])
data = DavidaniClient(token=token).get("/api/seller-admin/order/list")
```

`pip install -e ".[dev]" && pytest -v` runs the suite.

---

## 13. Rules for an agent given this access

1. **Read-only by default.** No `xt.*.asp` on the ERP. No POST on the admin API
   beyond `product/list` and login.
2. **Never print, log, commit, or echo a credential.** Environment-variable
   names and Keychain key names only — which is all this document contains.
3. **Never brute-force the ERP.** Check `ots_totals.json` first, then
   `bulk_ots`, then per-style — and only for the working set.
4. **Treat a non-JSON ERP body as an expired session**, reset, and retry — do
   not parse it, and do not report it as "the ERP returned garbage".
5. **Don't reimplement ship-date logic.** Import `api/shipdate.py`.
6. **Pin `today=`** in any test touching dates.
7. **Two businesses share this machine.** `davidani-*` / `davistudio-*` are
   Davi & Dani (wholesale fashion); `polieco-growth-studio` is PoliEco
   (Shopify) and is a different company. Never point one's tooling at the
   other's data.
8. **Deploys are `git push`.** Never a Vercel CLI deploy.
