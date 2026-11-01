// Smoke test cho extension (repo này):
//  - popup.html / options.html chỉ tham chiếu asset local (JS/CSS) tồn tại
//  - manifest.json là JSON hợp lệ + icon khai báo tồn tại
//  - mọi file JS (background/content/popup/options + js/*.js) pass `node --check`
// Chạy: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("popup.html / options.html tham chiếu asset local đều tồn tại", () => {
  for (const file of ["popup.html", "options.html"]) {
    const html = readFileSync(path.join(root, file), "utf8");
    const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
      .map((m) => m[1])
      // chỉ quan tâm asset local có extension (bỏ link điều hướng "#" hay "https://...")
      .filter((u) => !/^(https?:)?\/\//.test(u) && !u.startsWith("data:"))
      .filter((u) => /\.[a-z0-9]+$/i.test(u.split("?")[0]));
    assert.ok(refs.length > 0, `${file} không tham chiếu asset nào — kiểm tra lại`);
    for (const ref of refs) {
      const p = path.join(root, decodeURIComponent(ref.split("?")[0]));
      assert.ok(existsSync(p), `${file}: thiếu asset "${ref}"`);
    }
  }
});

test("manifest.json là JSON hợp lệ + icon khai báo tồn tại", () => {
  const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.name && manifest.version, "manifest thiếu name/version");

  for (const [size, file] of Object.entries(manifest.icons || {})) {
    const p = path.join(root, file);
    assert.ok(existsSync(p), `manifest.icons[${size}]: thiếu file "${file}"`);
  }
  for (const [size, file] of Object.entries(manifest.action?.default_icon || {})) {
    const p = path.join(root, file);
    assert.ok(existsSync(p), `action.default_icon[${size}]: thiếu file "${file}"`);
  }
});

test("tất cả file JS pass node --check", () => {
  const jsFiles = [
    "background.js",
    "content.js",
    "js/popup.js",
    "js/options.js",
    ...readdirSync(path.join(root, "js"), { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".js"))
      .map((e) => `js/${e.name}`)
  ];
  const unique = [...new Set(jsFiles)].sort();
  assert.ok(unique.length >= 6, `kỳ vọng >= 6 file JS, tìm thấy: ${unique.join(", ")}`);

  for (const f of unique) {
    const p = path.join(root, f);
    assert.ok(existsSync(p), `thiếu file "${f}"`);
    const r = spawnSync(process.execPath, ["--check", p], { encoding: "utf8" });
    assert.equal(r.status, 0, `node --check thất bại cho ${f}:\n${r.stderr}`);
  }
});
