# Mini Name Screening Service

A small Node.js backend that reads a person record from a file, compares the name against a watchlist using fuzzy (Levenshtein-based) matching, and writes screening results to JSON files. No database—file I/O and JSON only.

## Setup

```bash
npm install
```

## Run

```bash
npm start
```

Server listens on `http://localhost:3000` (or `PORT` env var).

**If you see `EADDRINUSE: address already in use :::3000`:** another process is using port 3000 (e.g. an old server). On Windows, free it with:
```powershell
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```
Replace `<PID>` with the number from the last column. Or start on a different port: `$env:PORT=3001; npm start`

## API

- **POST** `/process/:userId/:requestId`  
  Runs screening for the request at `data/{userId}/{requestId}/input/input.json`.  
  **Success (200):** `{ "success": true, "outputPath": "<absolute path to output folder>" }`  
  **Error (4xx/5xx):** `{ "success": false, "error": "<message>" }`

## Input

- **Input file:** `data/{userId}/{requestId}/input/input.json`
- **Watchlist:** `watchlist.json` at project root

**Example input.json**

```json
{
  "requestId": "REQ-3001",
  "fullName": "Alex Jon Smyth",
  "country": "US"
}
```

Optional `aliases` array for multiple names; best match across `fullName` and all aliases is used.

**Example watchlist.json**

```json
[
  { "id": "W1", "name": "Alex John Smith" },
  { "id": "W2", "name": "Maria Garcia" }
]
```

## Output

Written under `data/{userId}/{requestId}/output/`:

- **detailed.json** — Raw name, normalized name, best match, score, match type, top 3 closest matches.
- **consolidated.json** — Final screening result and timestamp.

If these files already exist, processing is skipped and the existing output path is returned.

## Match classification

- **EXACT_MATCH:** score ≥ 0.90  
- **POSSIBLE_MATCH:** 0.75 ≤ score &lt; 0.90  
- **NO_MATCH:** score &lt; 0.75  

## Behaviour

- Names are normalized (lowercase, trim, remove punctuation, collapse spaces).
- Token reordering is supported (e.g. "Smith Alex" vs "Alex Smith") via sorted-token comparison.
- Similarity is Levenshtein-based; spelling differences and missing letters are allowed.
- If input or watchlist is missing or JSON is invalid, an error is logged and no output files are created.

## Testing with Postman

1. **Start the server** (in a terminal):
   ```bash
   npm start
   ```

2. **Import the collection** (optional):
   - Open Postman → **Import** → choose `postman/Mini Name Screening.postman_collection.json`.
   - The collection uses variable `baseUrl` = `http://localhost:3000`. Change it if your server uses another port.

3. **Send a request** (file-based input):
   - **Method:** `POST`
   - **URL:** `http://localhost:3000/process/user1/REQ-3001`
   - **Headers:** `Content-Type: application/json`
   - **Body:** raw, JSON: `{}`
   - Send. The name screened is read from `data/user1/REQ-3001/input/input.json`. You should get **200** with `{ "success": true, "outputPath": "..." }`.

4. **Test with input in the body** (no file needed):
   - **URL:** `http://localhost:3000/process/user1/REQ-TEST1`
   - **Body:** raw, JSON, for example:
     ```json
     {
       "requestId": "REQ-TEST1",
       "fullName": "Maria Garcia",
       "country": "US"
     }
     ```
   - Optional: add `"aliases": ["M. Garcia"]` to screen multiple names.
   - Send. The name(s) in the body are screened against the watchlist; result is written to `data/user1/REQ-TEST1/output/`.

5. **Try other cases**:
   - Change URL to `.../process/user1/REQ-3001` again → same result (reprocessing skipped).
   - Use `.../process/nouser/NOREQ` → **400** with `"error": "Input file missing"` (no such input folder).

## Example request (curl)

```bash
curl -X POST http://localhost:3000/process/user1/REQ-3001 -H "Content-Type: application/json" -d "{}"
```

Expected: `"Alex Jon Smyth"` matches watchlist "Alex John Smith" with high similarity (e.g. EXACT_MATCH or POSSIBLE_MATCH depending on threshold).
