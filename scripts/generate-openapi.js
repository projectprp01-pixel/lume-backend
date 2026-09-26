/**
 * Generates openapi.yaml from the tracked Postman collection.
 *
 *   npm run generate:openapi
 *
 * The collection (collection/lume-api.postman_collection.json) is the source of truth; openapi.yaml is
 * derived output — edit the collection, not the YAML.
 *
 * `postman-to-openapi` does the core conversion (paths, methods, parameters, request bodies, bearer
 * auth, folder descriptions). On its own it falls short of what this collection needs, so the script
 * prepares the input and post-processes the output:
 *
 *   Before conversion
 *   - Flattens nested folders, so each of the 26 top-level folders is exactly one tag (the library would
 *     otherwise tag "18.1 …" sub-folders separately and drop the parent tag).
 *   - Removes the "⚠ Error path / Edge case" requests from the library's input: they hit the same
 *     method+path as the real request and the library keeps the LAST one per path, which would overwrite
 *     the real operation. Their saved examples are NOT lost — each one is folded into the real operation
 *     as a named example (skipped only if an identical status+body example is already there).
 *
 *   After conversion
 *   - Responses: the library emits a single generic "Successful response" from the status code in the test
 *     script and ignores saved examples. Every saved example (success, empty-result, error) is added as a
 *     named response example under its real status code.
 *   - Requests marked "No Auth" in the collection get `security: []` (public routes).
 *   - Content-Type/Authorization header "parameters" are removed (OpenAPI models these elsewhere).
 *   - File-upload requests get a multipart/form-data request body listing their fields.
 */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import postmanToOpenApi from 'postman-to-openapi';
import * as yaml from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = path.join(root, 'collection', 'lume-api.postman_collection.json');
const OUTPUT = path.join(root, 'openapi.yaml');
const pkg = createRequire(import.meta.url)('../package.json');

const collection = JSON.parse(await fs.readFile(INPUT, 'utf8'));

// ---- prepare: flatten to top-level folders, drop edge-case duplicates ----
const leaves = (node) => (node.item ? node.item.flatMap(leaves) : [node]);
const isEdgeCase = (req) => req.name.startsWith('⚠');
// Two requests are the same OpenAPI operation when method + path match once parameter NAMES are ignored
// (`/x/{a}` and `/x/{b}` are equivalent templated paths, which OpenAPI forbids).
const routeOf = (req) => '/' + (req.request.url.path ?? []).map((s) => s.replace(/^\{\{(.+)\}\}$/, '{$1}')).join('/');
const opKey = (req) => `${req.request.method.toLowerCase()} ${routeOf(req).replace(/\{[^}]+\}/g, '{}')}`;

const byOperation = new Map(); // opKey -> { req: first request, examples: every saved example merged from all requests on it }
const edgeRequests = [];
const merged = [];
const prepared = structuredClone(collection);
prepared.item = collection.item.map((folder) => {
  const kept = [];
  for (const req of leaves(folder)) {
    if (isEdgeCase(req)) { edgeRequests.push(req); continue; }
    const key = opKey(req);
    if (byOperation.has(key)) {
      // Same operation documented by a second request (e.g. two facility types created via one endpoint):
      // keep the first as the operation, fold this one's saved examples in, labelled with its name.
      const entry = byOperation.get(key);
      entry.examples.push(...(req.response ?? []).map((ex) => ({ ...ex, name: `${ex.name} — ${req.name}` })));
      merged.push(`${key}  <-  "${req.name}"`);
      continue;
    }
    byOperation.set(key, { req, examples: [...(req.response ?? [])] });
    kept.push(req);
  }
  return { name: folder.name, description: folder.description, item: kept };
});

// ---- fold edge-case examples into the real operation they exercise ----
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
const routeMatches = (template, actual) => new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(actual);
let foldedExamples = 0;
let alreadyPresent = 0;
for (const edge of edgeRequests) {
  const method = edge.request.method.toLowerCase();
  const actual = routeOf(edge);
  const target = [...byOperation.entries()].find(([key, e]) => key.startsWith(`${method} `) && (key === opKey(edge) || routeMatches(routeOf(e.req), actual)));
  if (!target) throw new Error(`Edge-case request "${edge.name}" (${method} ${actual}) has no real operation to fold into`);
  const entry = target[1];
  for (const ex of edge.response ?? []) {
    const dup = entry.examples.some((x) => x.code === ex.code && canon(JSON.parse(x.body)) === canon(JSON.parse(ex.body)));
    if (dup) { alreadyPresent++; continue; }
    entry.examples.push({ ...ex, name: `${ex.name} — ${edge.name.replace(/^⚠\s*/, '')}` });
    foldedExamples++;
  }
}

const baseUrl = (collection.variable.find((v) => v.key === 'baseUrl') ?? {}).value || 'http://localhost:3000';
const tmp = path.join(os.tmpdir(), `lume-collection-${process.pid}.json`);
await fs.writeFile(tmp, JSON.stringify(prepared));

let yml;
try {
  yml = await postmanToOpenApi(tmp, null, {
    info: { version: pkg.version },
    servers: [{ url: baseUrl, description: 'Local development server (collection variable {{baseUrl}})' }],
  });
} finally {
  await fs.rm(tmp, { force: true });
}
const spec = yaml.load(yml);

// ---- post-process: examples, public routes, headers, multipart ----
const STATUS_TEXT = { 200: 'OK', 201: 'Created', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 500: 'Internal Server Error', 502: 'Bad Gateway' };
let exampleCount = 0;
let operations = 0;
for (const [route, methods] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(methods)) {
    operations++;
    const entry = byOperation.get(`${method} ${route.replace(/\{[^}]+\}/g, '{}')}`);
    if (!entry) continue;
    const { req, examples } = entry;

    // responses: one entry per status code, each saved example a named example
    const responses = {};
    for (const ex of examples) {
      let value;
      try { value = JSON.parse(ex.body); } catch { continue; }
      const code = String(ex.code);
      responses[code] ??= { description: STATUS_TEXT[ex.code] ?? `HTTP ${code}`, content: { 'application/json': { examples: {} } } };
      let name = ex.name;
      const bucket = responses[code].content['application/json'].examples;
      for (let n = 2; bucket[name]; n++) name = `${ex.name} (${n})`;
      bucket[name] = { summary: ex.name, value };
      exampleCount++;
    }
    if (Object.keys(responses).length) op.responses = responses;

    if (req.request.auth?.type === 'noauth') op.security = [];

    if (op.parameters) {
      op.parameters = op.parameters.filter((p) => !(p.in === 'header' && /^(content-type|authorization|accept)$/i.test(p.name)));
      if (!op.parameters.length) delete op.parameters;
    }

    const body = req.request.body;
    if (body?.mode === 'formdata') {
      op.requestBody = {
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: Object.fromEntries(body.formdata.map((f) => [
                f.key,
                f.type === 'file'
                  ? { type: 'string', format: 'binary', ...(f.description ? { description: f.description } : {}) }
                  : { type: 'string', ...(f.value ? { example: f.value } : {}), ...(f.description ? { description: f.description } : {}) },
              ])),
            },
          },
        },
      };
    }
  }
}

await fs.writeFile(OUTPUT, yaml.dump(spec, { noRefs: true, lineWidth: -1, skipInvalid: true }), 'utf8');

console.log(`openapi.yaml written: ${operations} operations, ${spec.tags?.length ?? 0} tags, ${exampleCount} response examples`);
console.log(`  ${edgeRequests.length} edge-case request(s) folded into their real operations: ${foldedExamples} example(s) added, ${alreadyPresent} already present (identical status+body)`);
if (merged.length) console.log(`  merged ${merged.length} request(s) that share an operation (their examples were kept):\n    - ${merged.join('\n    - ')}`);
