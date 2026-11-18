// lanturn-search: a small standalone full-text search engine (BM25, field weights, prefix matching).
// Runs as a long-lived child process of the Node server and talks a line protocol over stdin/stdout, so a crash
// or a bad query can never take the API down, and the supervisor in src/searchEngine.js simply restarts it.
//
//   LOAD <TAB> path            index a TSV file: id, title, company, skills, body        -> OK <docs> <terms> <ms>
//   Q <TAB> limit <TAB> query  rank; every query token is a prefix match                 -> R <TAB> total <TAB> id:score,id:score...
//   PING                                                                                 -> PONG
//   QUIT
// Every request may be prefixed with "#<n><TAB>"; the reply then carries the same prefix (so requests can pipeline).
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <fstream>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

struct Posting { uint32_t doc; float tf; };
struct Engine {
  std::vector<long long> ids;
  std::vector<float> len;
  float avgLen = 1;
  std::map<std::string, std::vector<Posting>> inv;  // ordered: prefix queries become a range scan
} E;

static void tokens(const std::string& s, std::vector<std::string>& out) {
  std::string cur;
  for (unsigned char c : s) {
    if ((c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || c == '+' || c == '#') cur.push_back((char)c);
    else if (c >= 'A' && c <= 'Z') cur.push_back((char)(c - 'A' + 'a'));
    else if (!cur.empty()) { out.push_back(cur); cur.clear(); }
  }
  if (!cur.empty()) out.push_back(cur);
}
static std::vector<std::string> split(const std::string& s, char d) {
  std::vector<std::string> r; size_t a = 0;
  for (;;) { size_t b = s.find(d, a); if (b == std::string::npos) { r.push_back(s.substr(a)); break; } r.push_back(s.substr(a, b - a)); a = b + 1; }
  return r;
}

static std::string load(const std::string& path) {
  auto t0 = std::chrono::steady_clock::now();
  std::ifstream f(path);
  if (!f) return "ERR\tcannot open file";
  Engine n;
  std::unordered_map<std::string, std::unordered_map<uint32_t, float>> tmp;
  std::string line;
  while (std::getline(f, line)) {
    auto c = split(line, '\t');
    if (c.size() < 5) continue;
    uint32_t d = (uint32_t)n.ids.size();
    n.ids.push_back(std::atoll(c[0].c_str()));
    float len = 0;
    const float W[4] = {3.f, 2.f, 2.f, 1.f};  // title, company, skills, body
    for (int fi = 0; fi < 4; fi++) {
      std::vector<std::string> tk; tokens(c[1 + fi], tk);
      for (auto& t : tk) { tmp[t][d] += W[fi]; len += W[fi]; }
    }
    n.len.push_back(len);
  }
  double sum = 0; for (float l : n.len) sum += l;
  n.avgLen = n.len.empty() ? 1.f : (float)(sum / n.len.size());
  for (auto& kv : tmp) {
    auto& v = n.inv[kv.first]; v.reserve(kv.second.size());
    for (auto& p : kv.second) v.push_back({p.first, p.second});
    std::sort(v.begin(), v.end(), [](const Posting& a, const Posting& b) { return a.doc < b.doc; });
  }
  E = std::move(n);
  double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
  char buf[128]; std::snprintf(buf, sizeof buf, "OK\t%zu\t%zu\t%.1f", E.ids.size(), E.inv.size(), ms);
  return buf;
}

static std::string query(size_t limit, const std::string& q) {
  std::vector<std::string> qt; tokens(q, qt);
  if (qt.empty() || E.ids.empty()) return "R\t0\t";
  const double N = (double)E.ids.size(), k1 = 1.2, b = 0.75;
  std::vector<float> score(E.ids.size(), 0.f);
  std::vector<int> hits(E.ids.size(), 0);
  for (auto& t : qt) {
    // df is over the whole prefix family (docs containing any term that starts with t), so a rare longer word
    // cannot outrank the exact word the user typed.
    std::vector<char> seen(E.ids.size(), 0);
    size_t df = 0;
    for (auto it = E.inv.lower_bound(t); it != E.inv.end() && it->first.compare(0, t.size(), t) == 0; ++it)
      for (auto& p : it->second) if (!seen[p.doc]) { seen[p.doc] = 1; df++; }
    if (!df) continue;
    double idf = std::log(1.0 + (N - df + 0.5) / (df + 0.5));
    std::vector<float> best(E.ids.size(), 0.f);
    for (auto it = E.inv.lower_bound(t); it != E.inv.end() && it->first.compare(0, t.size(), t) == 0; ++it) {
      double exact = it->first.size() == t.size() ? 1.0 : 0.6;   // exact term beats a mere prefix
      for (auto& p : it->second) {
        double s = idf * (p.tf * (k1 + 1)) / (p.tf + k1 * (1 - b + b * E.len[p.doc] / E.avgLen)) * exact;
        if (s > best[p.doc]) best[p.doc] = (float)s;
      }
    }
    for (size_t d = 0; d < E.ids.size(); d++) if (seen[d]) { score[d] += best[d]; hits[d]++; }
  }
  // AND semantics: a job must match every query token
  std::vector<std::pair<float, uint32_t>> r;
  for (uint32_t d = 0; d < E.ids.size(); d++) if (hits[d] == (int)qt.size()) r.push_back({score[d], d});
  std::sort(r.begin(), r.end(), [](auto& a, auto& b) { return a.first != b.first ? a.first > b.first : a.second < b.second; });
  std::ostringstream o; o << "R\t" << r.size() << "\t";
  for (size_t i = 0; i < r.size() && i < limit; i++) { if (i) o << ','; o << E.ids[r[i].second] << ':' << std::fixed << r[i].first; }
  return o.str();
}

int main() {
  std::ios::sync_with_stdio(false);
  std::string line;
  while (std::getline(std::cin, line)) {
    if (!line.empty() && line.back() == '\r') line.pop_back();
    std::string tag;
    if (!line.empty() && line[0] == '#') { size_t t = line.find('\t'); if (t == std::string::npos) continue; tag = line.substr(0, t + 1); line = line.substr(t + 1); }
    std::string out;
    if (line == "PING") out = "PONG";
    else if (line == "QUIT") break;
    else if (line.rfind("LOAD\t", 0) == 0) out = load(line.substr(5));
    else if (line.rfind("Q\t", 0) == 0) {
      auto p = split(line, '\t');
      out = p.size() >= 3 ? query((size_t)std::max(1, std::atoi(p[1].c_str())), p[2]) : "ERR\tbad query";
    } else out = "ERR\tunknown command";
    std::cout << tag << out << '\n' << std::flush;
  }
  return 0;
}
