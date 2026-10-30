import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeHtml, html, raw, SafeHtml } from "../../src/phoneforensics/static/js/html.js";

test("escapes every special character", () => {
  assert.equal(
    escapeHtml(`<a href="x" onclick='y'>&</a>`),
    "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
  );
});

test("interpolated values are escaped", () => {
  const name = '<img src=x onerror="alert(1)">';
  assert.equal(html`<p>${name}</p>`.value, "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>");
});

test("attribute injection is neutralised", () => {
  const value = '" autofocus onfocus="alert(1)';
  assert.equal(html`<input value="${value}">`.value, '<input value="&quot; autofocus onfocus=&quot;alert(1)">');
});

test("nested templates and raw() are not double-escaped", () => {
  const inner = html`<b>${"a&b"}</b>`;
  assert.equal(html`<p>${inner}${raw("<i>ok</i>")}</p>`.value, "<p><b>a&amp;b</b><i>ok</i></p>");
});

test("arrays are joined and their items escaped", () => {
  assert.equal(html`<ul>${["<x>", html`<li>y</li>`]}</ul>`.value, "<ul>&lt;x&gt;<li>y</li></ul>");
});

test("null, undefined and false render as nothing; numbers and true as text", () => {
  assert.equal(html`${null}${undefined}${false}${0}${true}`.value, "0true");
});

test("html returns SafeHtml", () => {
  assert.ok(html`x` instanceof SafeHtml);
  assert.equal(String(html`x`), "x");
});
