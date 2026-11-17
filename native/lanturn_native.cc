// LanTURN native core: hot loops in C++17 over the stable N-API C interface (no node-gyp, no node-addon-api).
//
//   matchMany(skillIds:Int32Array, offsets:Int32Array, reqIds:Int32Array, reqWeights:Int32Array) -> Uint8Array
//       weighted skill coverage (percent) of one job for many students, CSR layout (see src/match.js)
//   buildScanner(aliases:string[]) -> External
//   scanLines(scanner, text:string) -> Int32Array [line, aliasIndex, line, aliasIndex, ...]
//       Aho-Corasick multi-pattern scan with the same word-boundary rules as the JS regexes in src/ai/skills.js
//
// Both functions have exact JS equivalents; tests assert parity.
#include <node_api.h>
#include <cstdint>
#include <cstring>
#include <array>
#include <queue>
#include <string>
#include <vector>

#define NAPI_OK_OR_RETURN(call) do { if ((call) != napi_ok) return nullptr; } while (0)

static napi_value throwErr(napi_env env, const char* msg) { napi_throw_error(env, nullptr, msg); return nullptr; }

static bool typedInfo(napi_env env, napi_value v, napi_typedarray_type want, void** data, size_t* len) {
  napi_typedarray_type t; napi_value ab; size_t off;
  if (napi_get_typedarray_info(env, v, &t, len, data, &ab, &off) != napi_ok || t != want) return false;
  return true;
}

// ---------------------------------------------------------------- matchMany
static napi_value MatchMany(napi_env env, napi_callback_info info) {
  size_t argc = 4; napi_value argv[4];
  NAPI_OK_OR_RETURN(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
  if (argc < 4) return throwErr(env, "matchMany needs 4 arguments");
  void *sd, *od, *rd, *wd; size_t sn, on, rn, wn;
  if (!typedInfo(env, argv[0], napi_int32_array, &sd, &sn) || !typedInfo(env, argv[1], napi_int32_array, &od, &on) ||
      !typedInfo(env, argv[2], napi_int32_array, &rd, &rn) || !typedInfo(env, argv[3], napi_int32_array, &wd, &wn) || rn != wn || on == 0)
    return throwErr(env, "matchMany expects four Int32Arrays (offsets non-empty, reqIds/reqWeights same length)");
  const int32_t* skills = (const int32_t*)sd; const int32_t* offs = (const int32_t*)od;
  const int32_t* rid = (const int32_t*)rd; const int32_t* rw = (const int32_t*)wd;
  size_t students = on - 1;

  // A JS Map keeps the last weight for a repeated id, while the job's total is the plain sum over all rows.
  int32_t maxId = 0; int64_t total = 0;
  for (size_t i = 0; i < rn; i++) { if (rid[i] > maxId) maxId = rid[i]; total += rw[i]; }
  std::vector<int32_t> weight((size_t)maxId + 1, 0);
  for (size_t i = 0; i < rn; i++) if (rid[i] >= 0) weight[rid[i]] = rw[i];

  napi_value ab, out; void* od2;
  NAPI_OK_OR_RETURN(napi_create_arraybuffer(env, students, &od2, &ab));
  uint8_t* res = (uint8_t*)od2; std::memset(res, 0, students);
  NAPI_OK_OR_RETURN(napi_create_typedarray(env, napi_uint8_array, students, ab, 0, &out));
  if (total <= 0) return out;
  for (size_t s = 0; s < students; s++) {
    int64_t have = 0;
    for (int32_t k = offs[s]; k < offs[s + 1]; k++) { int32_t id = skills[k]; if (id >= 0 && id <= maxId) have += weight[id]; }
    // Math.round(x) in JS rounds half up; have/total*100 with integers: floor((200*have + total) / (2*total))
    res[s] = (uint8_t)((200 * have + total) / (2 * total));
  }
  return out;
}

// ---------------------------------------------------------------- Aho-Corasick scanner
struct Scanner {
  std::vector<std::array<int32_t, 128>> next;  // goto table (full DFA after build)
  std::vector<std::vector<int32_t>> out;       // alias indices ending at this state
  std::vector<int32_t> aliasLen;
  Scanner() { addState(); }
  int32_t addState() { std::array<int32_t, 128> a; a.fill(-1); next.push_back(a); out.emplace_back(); return (int32_t)next.size() - 1; }
};

static void finalizeScanner(napi_env, void* data, void*) { delete (Scanner*)data; }

static inline bool wordc(unsigned char c) { return (c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '+' || c == '#'; }
static inline bool alnum(unsigned char c) { return (c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z'); }

static napi_value BuildScanner(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value argv[1];
  NAPI_OK_OR_RETURN(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
  uint32_t n = 0;
  if (argc < 1 || napi_get_array_length(env, argv[0], &n) != napi_ok) return throwErr(env, "buildScanner expects an array of strings");
  auto* sc = new Scanner();
  sc->aliasLen.assign(n, 0);
  for (uint32_t i = 0; i < n; i++) {
    napi_value el; napi_get_element(env, argv[0], i, &el);
    size_t len = 0; napi_get_value_string_utf8(env, el, nullptr, 0, &len);
    std::string s(len + 1, '\0'); napi_get_value_string_utf8(env, el, &s[0], len + 1, &len); s.resize(len);
    bool ok = !s.empty();
    for (unsigned char c : s) if (c >= 128) ok = false;   // aliases are ASCII; anything else is left to the JS path
    if (!ok) continue;
    int32_t st = 0;
    for (unsigned char c : s) {
      if (c >= 'A' && c <= 'Z') c = c - 'A' + 'a';
      if (sc->next[st][c] < 0) { int32_t ns = sc->addState(); sc->next[st][c] = ns; }
      st = sc->next[st][c];
    }
    sc->out[st].push_back((int32_t)i); sc->aliasLen[i] = (int32_t)s.size();
  }
  // BFS to build failure links and a complete DFA
  std::vector<int32_t> fail(sc->next.size(), 0);
  std::queue<int32_t> q;
  for (int c = 0; c < 128; c++) { int32_t t = sc->next[0][c]; if (t < 0) sc->next[0][c] = 0; else { fail[t] = 0; q.push(t); } }
  while (!q.empty()) {
    int32_t u = q.front(); q.pop();
    for (int32_t a : sc->out[fail[u]]) sc->out[u].push_back(a);
    for (int c = 0; c < 128; c++) {
      int32_t v = sc->next[u][c];
      if (v < 0) sc->next[u][c] = sc->next[fail[u]][c];
      else { fail[v] = sc->next[fail[u]][c]; q.push(v); }
    }
  }
  napi_value ext;
  NAPI_OK_OR_RETURN(napi_create_external(env, sc, finalizeScanner, nullptr, &ext));
  return ext;
}

static napi_value ScanLines(napi_env env, napi_callback_info info) {
  size_t argc = 2; napi_value argv[2];
  NAPI_OK_OR_RETURN(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
  void* p = nullptr;
  if (argc < 2 || napi_get_value_external(env, argv[0], &p) != napi_ok || !p) return throwErr(env, "scanLines(scanner, text)");
  Scanner* sc = (Scanner*)p;
  size_t len = 0; napi_get_value_string_utf8(env, argv[1], nullptr, 0, &len);
  std::string text(len + 1, '\0'); napi_get_value_string_utf8(env, argv[1], &text[0], len + 1, &len); text.resize(len);

  std::vector<int32_t> hits;
  std::vector<int32_t> seenLine(sc->aliasLen.size(), -1);
  int32_t line = 0, st = 0;
  for (size_t i = 0; i < len; i++) {
    unsigned char c = (unsigned char)text[i];
    if (c == '\n') { line++; st = 0; continue; }
    if (c >= 128) { st = 0; continue; }
    if (c >= 'A' && c <= 'Z') c = c - 'A' + 'a';
    st = sc->next[st][c];
    for (int32_t a : sc->out[st]) {
      size_t end = i + 1, start = end - (size_t)sc->aliasLen[a];
      // same boundaries as /(?<![A-Za-z0-9+#])alias(?![A-Za-z0-9+#]|\.[A-Za-z0-9])/i, within the line
      if (start > 0 && text[start - 1] != '\n' && wordc((unsigned char)text[start - 1])) continue;
      if (end < len && text[end] != '\n') {
        unsigned char nx = (unsigned char)text[end];
        if (wordc(nx)) continue;
        if (nx == '.' && end + 1 < len && alnum((unsigned char)text[end + 1])) continue;
      }
      if (seenLine[a] == line) continue;
      seenLine[a] = line; hits.push_back(line); hits.push_back(a);
    }
  }
  napi_value ab, out; void* d;
  NAPI_OK_OR_RETURN(napi_create_arraybuffer(env, hits.size() * sizeof(int32_t), &d, &ab));
  if (!hits.empty()) std::memcpy(d, hits.data(), hits.size() * sizeof(int32_t));
  NAPI_OK_OR_RETURN(napi_create_typedarray(env, napi_int32_array, hits.size(), ab, 0, &out));
  return out;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor props[] = {
    { "matchMany", nullptr, MatchMany, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "buildScanner", nullptr, BuildScanner, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "scanLines", nullptr, ScanLines, nullptr, nullptr, nullptr, napi_default, nullptr },
  };
  napi_define_properties(env, exports, 3, props);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
